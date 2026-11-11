import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { executeRun } from "../src/lib/execute";
import { chatCompletion, chatCompletionJSON } from "../src/lib/llm";
import type { EvaluatorOutput } from "../src/lib/schemas";
import { scoreTotalFromBreakdown } from "../src/lib/score";
import { validPatch } from "./fixtures";
import { createRun } from "./helpers";

vi.mock("../src/lib/llm", () => ({
  chatCompletion: vi.fn(),
  chatCompletionJSON: vi.fn(),
}));

const RUBRIC_KEYS = [
  "constraint_coverage",
  "clarity_structure",
  "tone",
  "safety",
  "tool_correctness",
] as const;

function breakdownForSum(sum: number): EvaluatorOutput["score_breakdown"] {
  const breakdown: EvaluatorOutput["score_breakdown"] = {
    constraint_coverage: 0,
    clarity_structure: 0,
    tone: 0,
    safety: 0,
    tool_correctness: 0,
  };
  let remaining = sum;
  for (const key of RUBRIC_KEYS) {
    const portion = Math.min(5, Math.max(0, remaining));
    breakdown[key] = portion;
    remaining -= portion;
  }
  if (Math.abs(remaining) > 1e-9) {
    throw new Error(`Cannot represent rubric sum ${sum}`);
  }
  return breakdown;
}

function scriptLoop(sums: number[], patch: unknown = validPatch) {
  let evalIndex = 0;
  vi.mocked(chatCompletion).mockImplementation(async () => ({
    content: `Draft ${evalIndex + 1}`,
  }));
  vi.mocked(chatCompletionJSON).mockImplementation(async (messages) => {
    const system = messages[0]?.content ?? "";
    if (system.includes("strict evaluator")) {
      const sum = sums[evalIndex] ?? 0;
      evalIndex += 1;
      return {
        score_total: 1,
        score_breakdown: breakdownForSum(sum),
        violations: [],
        notes: "scripted",
      };
    }
    if (system.includes("improve the policy")) return patch;
    throw new Error(`Unexpected system prompt: ${system.slice(0, 80)}`);
  });
}

beforeEach(() => {
  process.env.USE_SIMULATION = "false";
  vi.mocked(chatCompletion).mockReset();
  vi.mocked(chatCompletionJSON).mockReset();
});

afterEach(() => {
  process.env.USE_SIMULATION = "true";
});

describe("executeRun with a mocked LLM client", () => {
  it("stops at the target using the rubric total when score_total disagrees", async () => {
    scriptLoop([10, 24, 0]);
    const run = await createRun({ maxAttempts: 5, targetScore: 90 });
    const result = await executeRun(run.id);

    expect(result.status).toBe("completed");
    expect(result.attempts.map((attempt) => attempt.scoreTotal)).toEqual([40, 96]);
    expect(result.attempts[0].scoreTotal).not.toBe(1);
    expect(result.attempts[0].scoreTotal).toBe(
      scoreTotalFromBreakdown(breakdownForSum(10))
    );
    expect(vi.mocked(chatCompletion)).toHaveBeenCalledTimes(2);
    expect(vi.mocked(chatCompletion).mock.calls.map((call) => call[1]?.temperature)).toEqual([
      0.4, 0.4,
    ]);
    expect(vi.mocked(chatCompletionJSON)).toHaveBeenCalledTimes(3);
    expect(vi.mocked(chatCompletionJSON).mock.calls.map((call) => call[1]?.temperature)).toEqual([
      0.1, 0.2, 0.1,
    ]);
    expect(result.policyVersions).toHaveLength(2);
  });

  it("treats 89 as below the target and 90 as reaching it", async () => {
    scriptLoop([22.25, 22.5]);
    const run = await createRun({ maxAttempts: 5, targetScore: 90 });
    const result = await executeRun(run.id);

    expect(result.attempts.map((attempt) => attempt.scoreTotal)).toEqual([89, 90]);
    expect(result.status).toBe("completed");
    expect(result.policyVersions).toHaveLength(2);
  });

  it("runs every attempt when scores stay below the target and does not patch the last one", async () => {
    scriptLoop([10, 10]);
    const run = await createRun({ maxAttempts: 2, targetScore: 90 });
    const result = await executeRun(run.id);

    expect(result.status).toBe("completed");
    expect(result.attempts.map((attempt) => attempt.scoreTotal)).toEqual([40, 40]);
    expect(result.attempts.every((attempt) => (attempt.scoreTotal ?? 0) < 90)).toBe(
      true
    );
    expect(result.policyVersions).toHaveLength(2);
    const patchCalls = vi
      .mocked(chatCompletionJSON)
      .mock.calls.filter((call) => call[0][0]?.content.includes("improve the policy"));
    expect(patchCalls).toHaveLength(1);
  });

  it("does not call the patcher when the first attempt already meets the target", async () => {
    scriptLoop([22.5, 0]);
    const run = await createRun({ maxAttempts: 4, targetScore: 90 });
    const result = await executeRun(run.id);

    expect(result.attempts.map((attempt) => attempt.scoreTotal)).toEqual([90]);
    expect(result.policyVersions).toHaveLength(1);
    expect(vi.mocked(chatCompletionJSON)).toHaveBeenCalledTimes(1);
  });

  it("marks the run failed when evaluator JSON does not match the schema", async () => {
    vi.mocked(chatCompletion).mockResolvedValue({ content: "draft" });
    vi.mocked(chatCompletionJSON).mockResolvedValue({ score_total: 50 });
    const run = await createRun({ maxAttempts: 3, targetScore: 90 });

    await expect(executeRun(run.id)).rejects.toThrow();

    const { prisma } = await import("../src/lib/db");
    const failed = await prisma.projectRun.findUnique({
      where: { id: run.id },
      include: { attempts: true, policyVersions: true },
    });
    expect(failed?.status).toBe("failed");
    expect(failed?.attempts).toHaveLength(0);
    expect(failed?.policyVersions.map((version) => version.version)).toEqual([1]);
  });

  it("keeps the scored attempt when the patch payload is malformed", async () => {
    scriptLoop([10], { rationale: 12 });
    const run = await createRun({ maxAttempts: 3, targetScore: 90 });

    await expect(executeRun(run.id)).rejects.toThrow();

    const { prisma } = await import("../src/lib/db");
    const failed = await prisma.projectRun.findUnique({
      where: { id: run.id },
      include: { attempts: true, policyVersions: true },
    });
    expect(failed?.status).toBe("failed");
    expect(failed?.attempts.map((attempt) => attempt.scoreTotal)).toEqual([40]);
    expect(failed?.policyVersions.map((version) => version.version)).toEqual([1]);
  });
});

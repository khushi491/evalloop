import { describe, expect, it } from "vitest";
import { runSuite } from "../src/lib/eval/suite";
import type { EvalTask } from "../src/lib/eval/tasks";
import type { RoleClient } from "../src/lib/eval/client";
import type { EvaluatorOutput } from "../src/lib/schemas";
import { DEFAULT_POLICY } from "../src/lib/schemas";
import { validPatch } from "./fixtures";

function evaluation(sum: number, note = "scripted"): EvaluatorOutput {
  const breakdown: EvaluatorOutput["score_breakdown"] = {
    constraint_coverage: 0,
    clarity_structure: 0,
    tone: 0,
    safety: 0,
    tool_correctness: 0,
  };
  let remaining = sum;
  for (const key of Object.keys(breakdown) as (keyof typeof breakdown)[]) {
    const portion = Math.min(5, Math.max(0, remaining));
    breakdown[key] = portion;
    remaining -= portion;
  }
  return {
    score_total: 0,
    score_breakdown: breakdown,
    violations: note === "scripted" ? [] : [{ type: "constraints", message: note, severity: "high" }],
    notes: note,
  };
}

function task(id: string, split: "train" | "heldout", prompt: string): EvalTask {
  return {
    id,
    title: id,
    split,
    category: "constrained-writing",
    prompt,
    constraints: ["Follow the prompt"],
    checks: [
      { id: "words", type: "max_words", max: 20 },
      { id: "need-refund", type: "required_keywords", keywords: ["refund"] },
    ],
  };
}

function client(options?: {
  sumFor?: (index: number) => number;
  note?: string;
  onPatch?: (input: {
    evaluation: EvaluatorOutput;
    failures: { message: string }[];
    taskText: string;
  }) => void;
  onSeed?: (seed: number | undefined, role: string) => void;
}): RoleClient {
  return {
    async runner(index, _task, _policy, call) {
      options?.onSeed?.(call?.seed, "runner");
      return {
        content: "hello from the runner",
        usage: { prompt_tokens: 10, completion_tokens: 1, total_tokens: 11, cached_tokens: 0 },
        attempts: 1,
      };
    },
    async evaluator(index) {
      return {
        data: evaluation(options?.sumFor?.(index) ?? 10, options?.note ?? "scripted"),
        usage: { prompt_tokens: 10, completion_tokens: 1, total_tokens: 11, cached_tokens: 0 },
        attempts: 1,
      };
    },
    async patcher(_index, taskText, _output, evaluation, _policy, patchContext) {
      options?.onPatch?.({
        evaluation,
        failures: patchContext?.hardCheckFailures ?? [],
        taskText,
      });
      return {
        data: validPatch,
        usage: { prompt_tokens: 10, completion_tokens: 1, total_tokens: 11, cached_tokens: 0 },
        attempts: 1,
      };
    },
    async reviser(index, _task, previous, critique, _policy, call) {
      options?.onSeed?.(call?.seed, "reviser");
      return {
        content: `${previous}\n${critique}\nrevised`,
        usage: { prompt_tokens: 10, completion_tokens: 1, total_tokens: 11, cached_tokens: 0 },
        attempts: 1,
      };
    },
  };
}

const shared = {
  runs: 1,
  maxAttempts: 2,
  targetScore: 90,
  maxCostUsd: 3,
  dryRun: false,
  model: "gpt-4o-mini",
};

describe("eval methods", () => {
  it("draws best-of-n inside the shared call budget and keeps the higher judge score", async () => {
    const seeds: number[] = [];
    const results = await runSuite({
      ...shared,
      tasks: [task("alpha", "train", "Train.")],
      method: "best-of-n",
      seed: 4,
      client: client({
        sumFor: (index) => (index === 1 ? 5 : 20),
        onSeed: (seed) => {
          if (seed !== undefined) seeds.push(seed);
        },
      }),
    });
    const run = results.training[0]?.runs[0];
    expect(run?.attempts).toHaveLength(2);
    expect(run?.selectedAttempt).toBe(2);
    expect(run?.attempts.map((attempt) => attempt.judge?.score)).toEqual([20, 80]);
    expect(run?.attempts.every((attempt) => attempt.policyVersion === 1)).toBe(true);
    expect(results.learnedPolicy.rules).toEqual(DEFAULT_POLICY.rules);
    expect(results.totals.modelCalls).toBe(4);
    expect(results.config.perTaskCallBudget).toBe(5);
    expect(results.config.seed).toBe(4);
    expect(seeds).toEqual([4, 5]);
    expect(run?.attempts.map((attempt) => attempt.calls.map((call) => call.role))).toEqual([
      ["runner", "evaluator"],
      ["runner", "evaluator"],
    ]);
  });

  it("revises the answer in self-refine and does not transfer a learned policy", async () => {
    const patched: string[] = [];
    const results = await runSuite({
      ...shared,
      tasks: [task("alpha", "train", "Train."), task("held", "heldout", "HELD-OUT-MARKER")],
      method: "self-refine",
      feedback: "both",
      stopping: "judge-and-hard",
      client: client({
        onPatch: ({ taskText }) => patched.push(taskText),
      }),
    });
    const run = results.training[0]?.runs[0];
    expect(patched).toEqual([]);
    expect(run?.attempts).toHaveLength(2);
    expect(run?.finalPolicy.version).toBe(1);
    expect(run?.attempts[1]?.calls.map((call) => call.role)).toEqual(["reviser", "evaluator"]);
    expect(run?.attempts[1]?.outputText).toContain("revised");
    expect(results.heldOut[0]?.runs[0]?.transfer).toBe("not-applicable");
    expect(results.heldOut[0]?.runs[0]?.learned.attempt).toBeNull();
    expect(results.learnedPolicy.rules).toEqual(DEFAULT_POLICY.rules);
  });

  it("stops a single shot after one draft", async () => {
    const results = await runSuite({
      ...shared,
      tasks: [task("alpha", "train", "Train.")],
      method: "single-shot",
      client: client({ sumFor: () => 5 }),
    });
    expect(results.training[0]?.runs[0]?.attempts).toHaveLength(1);
    expect(results.totals.modelCalls).toBe(2);
    expect(results.training[0]?.runs[0]?.attempts[0]?.calls.map((call) => call.role)).toEqual([
      "runner",
      "evaluator",
    ]);
  });

  it("stops on the judge alone when that stopping rule is selected", async () => {
    let patches = 0;
    const results = await runSuite({
      ...shared,
      tasks: [task("alpha", "train", "Train.")],
      method: "policy",
      stopping: "judge-only",
      client: client({
        sumFor: () => 25,
        onPatch: () => {
          patches += 1;
        },
      }),
    });
    const run = results.training[0]?.runs[0];
    expect(patches).toBe(0);
    expect(run?.attempts).toHaveLength(1);
    expect(run?.attempts[0]?.judge?.score).toBe(100);
    expect(run?.attempts[0]?.hardChecks.passed).toBe(1);
    expect(run?.reachedTarget).toBe(true);
  });

  it("sends the patcher only the selected feedback", async () => {
    const critiqueOnly: { failures: number; notes: string[] }[] = [];
    await runSuite({
      ...shared,
      tasks: [task("alpha", "train", "Train.")],
      feedback: "critique-only",
      client: client({
        note: "UNIQUE_CRITIQUE",
        onPatch: ({ evaluation, failures }) => {
          critiqueOnly.push({ failures: failures.length, notes: [evaluation.notes] });
        },
      }),
    });
    expect(critiqueOnly[0]?.failures).toBe(0);
    expect(critiqueOnly[0]?.notes).toEqual(["UNIQUE_CRITIQUE"]);

    const hardOnly: { failures: string[]; notes: string; violations: number }[] = [];
    await runSuite({
      ...shared,
      tasks: [task("alpha", "train", "Train.")],
      feedback: "hard-checks-only",
      client: client({
        note: "UNIQUE_CRITIQUE",
        onPatch: ({ evaluation, failures }) => {
          hardOnly.push({
            failures: failures.map((failure) => failure.message),
            notes: evaluation.notes,
            violations: evaluation.violations.length,
          });
        },
      }),
    });
    expect(hardOnly[0]?.notes).toBe("");
    expect(hardOnly[0]?.violations).toBe(0);
    expect(hardOnly[0]?.failures.some((message) => message.includes("refund"))).toBe(true);
  });
});

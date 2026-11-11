import { beforeEach, describe, expect, it, vi } from "vitest";
import { createRoleClient } from "../src/lib/eval/client";
import { runSuite } from "../src/lib/eval/suite";
import type { EvalTask } from "../src/lib/eval/tasks";
import { chatCompletion, chatCompletionJSONDetailed } from "../src/lib/llm";
import {
  EVALUATOR_TEMPERATURE,
  PATCHER_TEMPERATURE,
  RUNNER_TEMPERATURE,
} from "../src/lib/temperatures";
import { validEvaluator, validPatch } from "./fixtures";

vi.mock("../src/lib/llm", () => ({
  chatCompletion: vi.fn(),
  chatCompletionJSONDetailed: vi.fn(),
  emptyUsage: () => ({
    prompt_tokens: 0,
    completion_tokens: 0,
    total_tokens: 0,
    cached_tokens: 0,
  }),
  InvalidJsonError: class InvalidJsonError extends Error {
    usage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0, cached_tokens: 0 };
    attempts = 2;
  },
}));

const usage = {
  prompt_tokens: 20,
  completion_tokens: 10,
  total_tokens: 30,
  cached_tokens: 0,
};

const task: EvalTask = {
  id: "alpha",
  title: "Alpha",
  split: "train",
  prompt: "Write a short reply.",
  constraints: ["Stay short"],
  checks: [{ id: "words", type: "max_words", max: 40 }],
};

beforeEach(() => {
  vi.mocked(chatCompletion).mockReset();
  vi.mocked(chatCompletionJSONDetailed).mockReset();
  vi.mocked(chatCompletion).mockResolvedValue({ content: "A short reply.", usage });
  vi.mocked(chatCompletionJSONDetailed).mockImplementation(async (messages) => {
    const system = messages[0]?.content ?? "";
    if (system.includes("strict evaluator")) {
      return { data: validEvaluator, usage, attempts: 1 };
    }
    if (system.includes("improve the policy")) {
      return { data: validPatch, usage, attempts: 1 };
    }
    throw new Error(`Unexpected prompt: ${system.slice(0, 80)}`);
  });
});

describe("live eval client", () => {
  it("calls the API at the fixed product temperatures and records usage", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network"));
    const results = await runSuite({
      tasks: [task],
      runs: 1,
      maxAttempts: 2,
      targetScore: 90,
      maxCostUsd: 3,
      dryRun: false,
      model: "gpt-4o-mini",
      client: createRoleClient({ dryRun: false }),
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(vi.mocked(chatCompletion).mock.calls.map((call) => call[1]?.temperature)).toEqual([
      RUNNER_TEMPERATURE,
      RUNNER_TEMPERATURE,
    ]);
    expect(
      vi.mocked(chatCompletionJSONDetailed).mock.calls.map((call) => call[1]?.temperature)
    ).toEqual([EVALUATOR_TEMPERATURE, PATCHER_TEMPERATURE, EVALUATOR_TEMPERATURE]);
    expect(results.training[0]?.runs[0]?.attempts).toHaveLength(2);
    expect(results.totals.modelCalls).toBe(5);
    expect(results.totals.promptTokens).toBe(100);
    expect(results.totals.estimatedCostUsd).toBeGreaterThan(0);
    fetchMock.mockRestore();
  });

  it("sends deterministic hard-check failures to the patcher", async () => {
    vi.mocked(chatCompletion).mockResolvedValue({
      content: "A short reply without the required keyword.",
      usage,
    });
    await runSuite({
      tasks: [
        {
          ...task,
          checks: [{ id: "need-refund", type: "required_keywords", keywords: ["refund"] }],
        },
      ],
      runs: 1,
      maxAttempts: 2,
      targetScore: 90,
      maxCostUsd: 3,
      dryRun: false,
      model: "gpt-4o-mini",
      client: createRoleClient({ dryRun: false }),
    });

    const patcherCall = vi
      .mocked(chatCompletionJSONDetailed)
      .mock.calls.find((call) => (call[0][0]?.content ?? "").includes("improve the policy"));
    expect(patcherCall?.[0][1]?.content).toContain("## Hard-check failures");
    expect(patcherCall?.[0][1]?.content).toContain("Missing keywords: refund.");
  });
});

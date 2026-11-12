import { describe, expect, it } from "vitest";
import {
  buildEvaluatorMessages,
  buildPatcherMessages,
  buildRunnerMessages,
} from "../src/lib/prompts";
import { DEFAULT_POLICY } from "../src/lib/schemas";
import { SCORE_TOTAL_FORMULA } from "../src/lib/score";
import { validEvaluator } from "./fixtures";

describe("prompt builders", () => {
  it("gives the runner the task and the current policy", () => {
    const messages = buildRunnerMessages("UNIQUE_TASK", DEFAULT_POLICY);

    expect(messages[0].role).toBe("system");
    expect(messages[1].content).toContain("UNIQUE_TASK");
    expect(messages[1].content).toContain("calm, confident");
    expect(messages[1].content).toContain("max_words_default");
  });

  it("tells the evaluator how to compute score_total from the five categories", () => {
    const messages = buildEvaluatorMessages(
      "UNIQUE_TASK",
      "UNIQUE_OUTPUT",
      DEFAULT_POLICY
    );

    expect(messages.map((message) => message.content).join("\n")).toContain(
      SCORE_TOTAL_FORMULA
    );
    expect(messages[1].content).toContain("UNIQUE_TASK");
    expect(messages[1].content).toContain("UNIQUE_OUTPUT");
    expect(messages[1].content).toContain("constraint_coverage");
    expect(messages[1].content).toContain("tool_correctness");
  });

  it("gives the patcher the evaluation and asks for a policy update", () => {
    const messages = buildPatcherMessages(
      "UNIQUE_TASK",
      "UNIQUE_OUTPUT",
      validEvaluator,
      DEFAULT_POLICY
    );

    expect(messages[0].content).toContain("new_rules");
    expect(messages[0].content).toContain("remove_rules");
    expect(messages[1].content).toContain("UNIQUE_TASK");
    expect(messages[1].content).toContain("Safety failure.");
    expect(messages[1].content).not.toContain("Hard-check failures");
  });

  it("places hard-check failures next to the evaluator result", () => {
    const messages = buildPatcherMessages(
      "UNIQUE_TASK",
      "UNIQUE_OUTPUT",
      validEvaluator,
      DEFAULT_POLICY,
      [{ id: "need-refund", type: "required_keywords", message: "Missing keywords: refund." }]
    );

    const user = messages[1].content;
    const evaluatorAt = user.indexOf("## Evaluator Result");
    const failureAt = user.indexOf("## Hard-check failures");
    const policyAt = user.indexOf("## Current Policy");
    expect(evaluatorAt).toBeGreaterThan(-1);
    expect(failureAt).toBeGreaterThan(evaluatorAt);
    expect(policyAt).toBeGreaterThan(failureAt);
    expect(user).toContain("(need-refund) Missing keywords: refund.");
    expect(user).toContain("make each hard-check failure pass");
  });
});

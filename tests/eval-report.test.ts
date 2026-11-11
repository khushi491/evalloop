import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { summarizeEval } from "../src/lib/eval/aggregate";
import { GPT_4O_MINI_PRICE, estimateCostUsd } from "../src/lib/eval/cost";
import { mergeLearnedPolicies, policyDelta } from "../src/lib/eval/merge";
import {
  TOTAL_FORMULA,
  compositeTotal,
  expectedFullSuiteCalls,
  modelCallsForAttempts,
} from "../src/lib/eval/metrics";
import { formatUsd, renderResultsMarkdown } from "../src/lib/eval/report";
import { DEFAULT_POLICY, type Policy } from "../src/lib/schemas";
import type { AttemptRecord, EvalResults, JudgeRecord } from "../src/lib/eval/types";
import { repoRoot } from "./test-env";

function judge(score: number): JudgeRecord {
  return {
    score,
    breakdown: {
      constraint_coverage: 0,
      clarity_structure: 0,
      tone: 0,
      safety: 0,
      tool_correctness: 0,
    },
    violations: [],
    notes: "",
  };
}

function attempt(
  index: number,
  passed: number,
  totalChecks: number,
  judgeScore: number
): AttemptRecord {
  const passRate = passed / totalChecks;
  return {
    index,
    policyVersion: index,
    outputText: "draft",
    hardChecks: { passed, total: totalChecks, passRate, results: [] },
    judge: judge(judgeScore),
    total: compositeTotal(passRate, judgeScore),
    tokens: { prompt: 10, completion: 4, cached: 0 },
    costUsd: 0,
    latencyMs: 5,
    calls: [],
    error: null,
  };
}

function policy(overrides: Partial<Policy> = {}): Policy {
  return {
    version: 1,
    rules: ["A", "B"],
    style: { tone: "calm", max_words_default: 120 },
    checklist: ["C"],
    ...overrides,
    style: { tone: "calm", max_words_default: 120, ...overrides.style },
  };
}

describe("cost math", () => {
  it("prices gpt-4o-mini input, cached input, and output from the integer rate table", () => {
    expect(Math.round(GPT_4O_MINI_PRICE.inputUsdPerMillion * 1_000_000)).toBe(
      GPT_4O_MINI_PRICE.inputMicroUsdPerMillion
    );
    expect(Math.round(GPT_4O_MINI_PRICE.cachedInputUsdPerMillion * 1_000_000)).toBe(
      GPT_4O_MINI_PRICE.cachedInputMicroUsdPerMillion
    );
    expect(Math.round(GPT_4O_MINI_PRICE.outputUsdPerMillion * 1_000_000)).toBe(
      GPT_4O_MINI_PRICE.outputMicroUsdPerMillion
    );

    expect(estimateCostUsd({ prompt_tokens: 1_000_000, completion_tokens: 0 })).toBe(0.15);
    expect(estimateCostUsd({ prompt_tokens: 0, completion_tokens: 1_000_000 })).toBe(0.6);
    expect(
      estimateCostUsd({
        prompt_tokens: 1_000_000,
        completion_tokens: 0,
        cached_tokens: 400_000,
      })
    ).toBe(0.12);
    expect(estimateCostUsd({ prompt_tokens: 100, completion_tokens: 50 })).toBe(0.000045);
    expect(
      estimateCostUsd({ prompt_tokens: 10, completion_tokens: 0, cached_tokens: 999 })
    ).toBe(estimateCostUsd({ prompt_tokens: 10, completion_tokens: 0, cached_tokens: 10 }));
    expect(estimateCostUsd({ prompt_tokens: -5, completion_tokens: Number.NaN })).toBe(0);
  });

  it("formats sub-cent amounts without pretending they are zero", () => {
    expect(formatUsd(0)).toBe("$0.00");
    expect(formatUsd(3)).toBe("$3.00");
    expect(formatUsd(0.15)).toBe("$0.15");
    expect(formatUsd(0.6)).toBe("$0.60");
    expect(formatUsd(0.000045)).toBe("$0.000045");
  });
});

describe("learned policy merge", () => {
  it("drops a starting rule only when every training policy dropped it", () => {
    const initial = policy();
    const merged = mergeLearnedPolicies(initial, [
      policy({
        rules: ["A", "D"],
        checklist: ["C", "E"],
        style: { tone: "calm", max_words_default: 90 },
      }),
      policy({
        rules: ["A", "B", "F"],
        style: { tone: "warm", max_words_default: 100 },
      }),
    ]);

    expect(merged.rules).toEqual(["A", "B", "D", "F"]);
    expect(merged.checklist).toEqual(["C", "E"]);
    expect(merged.style.tone).toBe("calm");
    expect(merged.style.max_words_default).toBe(90);
    expect(merged.version).toBe(initial.version);
    expect(merged).not.toBe(initial);
  });

  it("uses a shared tone change and removes a rule every run deleted", () => {
    const merged = mergeLearnedPolicies(policy(), [
      policy({ rules: ["A"], style: { tone: "warm", max_words_default: 120 } }),
      policy({ rules: ["A", "F"], style: { tone: "warm", max_words_default: 120 } }),
    ]);
    expect(merged.rules).toEqual(["A", "F"]);
    expect(merged.style.tone).toBe("warm");
    expect(policyDelta(policy(), merged)).toMatchObject({
      rulesAdded: 1,
      rulesRemoved: 1,
      toneChanged: true,
    });
  });

  it("returns a clone of the initial policy when nothing was learned", () => {
    const initial = policy();
    const merged = mergeLearnedPolicies(initial, []);
    expect(merged).toEqual(initial);
    expect(merged).not.toBe(initial);
    merged.rules.push("extra");
    expect(initial.rules).toEqual(["A", "B"]);
  });
});

describe("aggregation and the results report", () => {
  const initial = { ...DEFAULT_POLICY };
  const learned: Policy = {
    ...DEFAULT_POLICY,
    rules: [...DEFAULT_POLICY.rules, "Count the words before sending."],
    style: { ...DEFAULT_POLICY.style, max_words_default: 90 },
  };

  function results(): EvalResults {
    return {
      version: 1,
      generatedAt: "2026-11-11T00:00:00.000Z",
      dryRun: false,
      aborted: false,
      abortReason: null,
      heldOutSkippedReason: null,
      config: {
        model: "gpt-4o-mini",
        temperature: { runner: 0.4, evaluator: 0.1, patcher: 0.2 },
        maxAttempts: 3,
        targetScore: 90,
        runs: 2,
        maxCostUsd: 3,
        taskIds: ["alpha", "beta", "held"],
        totalFormula: TOTAL_FORMULA,
        price: {
          model: "gpt-4o-mini",
          inputUsdPerMillion: GPT_4O_MINI_PRICE.inputUsdPerMillion,
          cachedInputUsdPerMillion: GPT_4O_MINI_PRICE.cachedInputUsdPerMillion,
          outputUsdPerMillion: GPT_4O_MINI_PRICE.outputUsdPerMillion,
          source: GPT_4O_MINI_PRICE.source,
          checkedOn: GPT_4O_MINI_PRICE.checkedOn,
          note: "Cached input is priced only when the API reports cached prompt tokens.",
        },
      },
      initialPolicy: initial,
      learnedPolicy: learned,
      training: [
        {
          id: "alpha",
          title: "Alpha",
          prompt: "Alpha prompt",
          constraints: ["Stay short"],
          runs: [
            {
              run: 1,
              reachedTarget: false,
              error: null,
              finalPolicy: learned,
              attempts: [attempt(1, 1, 2, 40), attempt(2, 1, 1, 80)],
            },
            {
              run: 2,
              reachedTarget: false,
              error: null,
              finalPolicy: learned,
              attempts: [attempt(1, 1, 2, 60), attempt(2, 1, 2, 60)],
            },
          ],
        },
        {
          id: "beta",
          title: "Beta",
          prompt: "Beta prompt",
          constraints: ["Use JSON"],
          runs: [
            {
              run: 1,
              reachedTarget: true,
              error: null,
              finalPolicy: learned,
              attempts: [attempt(1, 1, 1, 100)],
            },
          ],
        },
        {
          id: "broken",
          title: "Broken",
          prompt: "Broken prompt",
          constraints: ["Parse"],
          runs: [
            {
              run: 1,
              reachedTarget: false,
              error: "invalid JSON after 2 attempts",
              finalPolicy: initial,
              attempts: [
                {
                  ...attempt(1, 0, 1, 0),
                  judge: null,
                  total: null,
                  error: "The attempt ended before the judge returned a score.",
                },
              ],
            },
          ],
        },
      ],
      heldOut: [
        {
          id: "held",
          title: "Held",
          prompt: "Held prompt",
          constraints: ["Stay brief"],
          runs: [
            {
              run: 1,
              initial: { error: null, attempt: attempt(1, 1, 4, 20) },
              learned: { error: null, attempt: attempt(1, 3, 4, 60) },
            },
          ],
        },
      ],
      totals: {
        modelCalls: 11,
        promptTokens: 2200,
        completionTokens: 400,
        cachedPromptTokens: 50,
        estimatedCostUsd: 0.00057,
        callsMissingUsage: 0,
      },
    };
  }

  it("averages before and after within a task, then across tasks", () => {
    const summary = summarizeEval(results());
    const alpha = summary.training.tasks[0]!;
    expect(alpha.before).toEqual({ hardPassRate: 0.5, judgeScore: 50, total: 50 });
    expect(alpha.after).toEqual({ hardPassRate: 0.75, judgeScore: 70, total: 73 });
    expect(summary.training.average.before).toEqual({
      hardPassRate: 0.75,
      judgeScore: 75,
      total: 75,
    });
    expect(summary.training.average.after).toEqual({
      hardPassRate: 0.875,
      judgeScore: 85,
      total: 86,
    });
    expect(summary.training.tasks[2]?.before).toBeNull();
    expect(summary.heldOut.tasks[0]?.initial).toEqual({
      hardPassRate: 0.25,
      judgeScore: 20,
      total: 23,
    });
    expect(summary.heldOut.tasks[0]?.learned).toEqual({
      hardPassRate: 0.75,
      judgeScore: 60,
      total: 68,
    });
  });

  it("renders the before/after table, held-out section, prices, and cost", () => {
    const markdown = renderResultsMarkdown(results());
    expect(markdown).toContain("## Training");
    expect(markdown).toContain("## Held-out");
    expect(markdown).toContain("The patcher does not see held-out tasks.");
    expect(markdown).toContain("`alpha`");
    expect(markdown).toContain("50.0% | 50.0 | 50.0");
    expect(markdown).toContain("75.0% | 70.0 | 73.0");
    expect(markdown).toContain("**Average** | | | 75.0% | 75.0 | 75.0 | 87.5% | 85.0 | 86.0 |");
    expect(markdown).toContain("25.0% | 20.0 | 23.0");
    expect(markdown).toContain("75.0% | 60.0 | 68.0");
    expect(markdown).toContain("n/a");
    expect(markdown).toContain("invalid JSON after 2 attempts");
    expect(markdown).toContain("runner 0.4, evaluator 0.1, patcher 0.2");
    expect(markdown).toContain("input $0.15 per 1M tokens");
    expect(markdown).toContain("cached input $0.075 per 1M tokens");
    expect(markdown).toContain("output $0.60 per 1M tokens");
    expect(markdown).toContain("| Estimated cost | $0.00057 |");
    expect(markdown).toContain("| Model calls | 11 |");
    expect(markdown).toContain(TOTAL_FORMULA);
    expect(markdown.toLowerCase()).not.toContain("hackathon");
  });

  it("plans 68 model calls for the default full suite", () => {
    expect(modelCallsForAttempts(1)).toBe(2);
    expect(modelCallsForAttempts(3)).toBe(8);
    expect(
      expectedFullSuiteCalls({
        trainingTasks: 7,
        heldOutTasks: 3,
        runs: 1,
        maxAttempts: 3,
      })
    ).toBe(68);
  });

  it("keeps the checked-in report as a not-yet-run placeholder", () => {
    const readme = readFileSync(path.join(repoRoot, "README.md"), "utf8");
    const placeholder = readFileSync(path.join(repoRoot, "evals/RESULTS.md"), "utf8");
    expect(readme).toMatch(/## Evaluation/);
    expect(readme).toContain("evals/RESULTS.md");
    expect(readme.toLowerCase()).not.toContain("hackathon");
    expect(placeholder).toMatch(/Not yet run/i);
    expect(placeholder).not.toMatch(/\d+\.\d+%/);
    expect(placeholder.toLowerCase()).not.toContain("hackathon");
  });
});

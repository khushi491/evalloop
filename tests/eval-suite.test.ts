import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { parseEvalArgs } from "../src/lib/eval/args";
import { createRoleClient, type RoleClient } from "../src/lib/eval/client";
import { BudgetExceededError, priceForModel } from "../src/lib/eval/cost";
import { expectedFullSuiteCalls } from "../src/lib/eval/metrics";
import { runSuite } from "../src/lib/eval/suite";
import { loadTasks } from "../src/lib/eval/tasks";
import type { EvalTask } from "../src/lib/eval/tasks";
import { InvalidJsonError, type TokenUsage } from "../src/lib/llm";
import { DEFAULT_POLICY } from "../src/lib/schemas";
import type { EvaluatorOutput } from "../src/lib/schemas";
import { FIXED_TEMPERATURES } from "../src/lib/temperatures";
import { validPatch } from "./fixtures";
import { repoRoot } from "./test-env";

const originalFetch = globalThis.fetch.bind(globalThis);

function evaluation(sum: number): EvaluatorOutput {
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
    violations: [],
    notes: "scripted",
  };
}

function usage(prompt: number, completion = 0, cached = 0): TokenUsage {
  return {
    prompt_tokens: prompt,
    completion_tokens: completion,
    total_tokens: prompt + completion,
    cached_tokens: cached,
  };
}

function task(overrides: Partial<EvalTask> & Pick<EvalTask, "id" | "split" | "prompt">): EvalTask {
  return {
    title: overrides.id,
    constraints: ["Follow the prompt"],
    checks: [{ id: "words", type: "max_words", max: 20 }],
    ...overrides,
  };
}

function scriptedClient(options: {
  sum?: number;
  promptTokens?: number;
  failJson?: boolean;
  content?: string;
  onPatch?: (
    taskText: string,
    patchContext?: { hardCheckFailures: { id: string; message: string }[] }
  ) => void;
  onRole?: (role: "runner" | "evaluator" | "patcher") => void;
}): RoleClient {
  const tokens = options.promptTokens ?? 100;
  const content = options.content ?? "hello from the runner";
  return {
    async runner() {
      options.onRole?.("runner");
      return { content, usage: usage(tokens), attempts: 1 };
    },
    async evaluator() {
      options.onRole?.("evaluator");
      if (options.failJson) {
        throw new InvalidJsonError(
          "LLM returned invalid JSON after 2 attempts. Raw: {",
          usage(tokens),
          2
        );
      }
      return { data: evaluation(options.sum ?? 10), usage: usage(tokens), attempts: 1 };
    },
    async patcher(_attempt, taskText, _output, _evaluation, _policy, patchContext) {
      options.onRole?.("patcher");
      options.onPatch?.(taskText, patchContext);
      return { data: validPatch, usage: usage(tokens), attempts: 1 };
    },
  };
}

const mostlyPassingChecks: EvalTask["checks"] = [
  { id: "words", type: "max_words", max: 20 },
  { id: "min-words", type: "min_words", min: 1 },
  { id: "hello", type: "required_keywords", keywords: ["hello"] },
  { id: "runner", type: "required_keywords", keywords: ["runner"] },
  { id: "need-refund", type: "required_keywords", keywords: ["refund"] },
];

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("eval suite", () => {
  it("stops a training task when the total reaches the target and hard checks pass", async () => {
    let patches = 0;
    const results = await runSuite({
      tasks: [task({ id: "alpha", split: "train", prompt: "Train this." })],
      runs: 1,
      maxAttempts: 3,
      targetScore: 90,
      maxCostUsd: 3,
      dryRun: false,
      model: "gpt-4o-mini",
      client: scriptedClient({
        sum: 23,
        onPatch: () => {
          patches += 1;
        },
      }),
      now: new Date("2026-11-11T00:00:00.000Z"),
    });

    expect(patches).toBe(0);
    expect(results.training[0]?.runs[0]?.attempts).toHaveLength(1);
    expect(results.training[0]?.runs[0]?.reachedTarget).toBe(true);
    expect(results.training[0]?.runs[0]?.attempts[0]?.judge?.score).toBe(92);
    expect(results.training[0]?.runs[0]?.attempts[0]?.hardChecks.passed).toBe(1);
    expect(results.training[0]?.runs[0]?.attempts[0]?.total).toBe(96);
    expect(results.totals.modelCalls).toBe(2);
    expect(results.learnedPolicy.rules).toEqual(DEFAULT_POLICY.rules);
  });

  it("patches between attempts and never sends a held-out prompt to the patcher", async () => {
    const patched: string[] = [];
    const results = await runSuite({
      tasks: [
        task({ id: "alpha", split: "train", prompt: "Training prompt." }),
        task({
          id: "held",
          split: "heldout",
          prompt: "HELD-OUT-MARKER write a status note.",
        }),
      ],
      runs: 1,
      maxAttempts: 2,
      targetScore: 90,
      maxCostUsd: 3,
      dryRun: false,
      model: "gpt-4o-mini",
      client: scriptedClient({
        sum: 10,
        onPatch: (taskText) => {
          if (taskText.includes("HELD-OUT-MARKER")) {
            throw new Error("patcher saw a held-out task");
          }
          patched.push(taskText);
        },
      }),
    });

    expect(patched).toEqual(["Training prompt."]);
    const training = results.training[0]?.runs[0];
    expect(training?.attempts.map((item) => item.policyVersion)).toEqual([1, 2]);
    expect(training?.finalPolicy.rules).toContain("Ask for the last 4 digits only.");
    expect(training?.finalPolicy.style.max_words_default).toBe(90);
    const held = results.heldOut[0]?.runs[0];
    expect(held?.initial.attempt?.calls.map((call) => call.role)).toEqual(["runner", "evaluator"]);
    expect(held?.learned.attempt?.calls.map((call) => call.role)).toEqual(["runner", "evaluator"]);
    expect(results.learnedPolicy.rules).toContain("Ask for the last 4 digits only.");
    expect(results.totals.modelCalls).toBe(modelCallsForTrainingPlusHeldOut());
  });

  it("aborts before the next call once estimated cost reaches the cap", async () => {
    const results = await runSuite({
      tasks: [
        task({ id: "alpha", split: "train", prompt: "Train." }),
        task({ id: "held", split: "heldout", prompt: "Held." }),
      ],
      runs: 1,
      maxAttempts: 3,
      targetScore: 90,
      maxCostUsd: 0.2,
      dryRun: false,
      model: "gpt-4o-mini",
      client: scriptedClient({ sum: 10, promptTokens: 1_000_000 }),
    });

    expect(results.aborted).toBe(true);
    expect(results.abortReason).toMatch(/max-cost/);
    expect(results.totals.modelCalls).toBe(2);
    expect(results.totals.estimatedCostUsd).toBe(0.3);
    expect(results.training[0]?.runs[0]?.attempts).toHaveLength(1);
    expect(results.heldOut).toEqual([]);
    expect(results.heldOutSkippedReason).toMatch(/aborted during training/);
    expect(new BudgetExceededError(0.3, 0.2).name).toBe("BudgetExceededError");
  });

  it("counts token usage from a JSON failure and still records hard checks", async () => {
    const results = await runSuite({
      tasks: [task({ id: "alpha", split: "train", prompt: "Train." })],
      runs: 1,
      maxAttempts: 2,
      targetScore: 90,
      maxCostUsd: 3,
      dryRun: false,
      model: "gpt-4o-mini",
      client: scriptedClient({ failJson: true, promptTokens: 1_000 }),
    });

    const run = results.training[0]?.runs[0];
    expect(run?.error).toMatch(/invalid JSON after 2 attempts/);
    expect(run?.attempts[0]?.judge).toBeNull();
    expect(run?.attempts[0]?.hardChecks.total).toBe(1);
    expect(run?.attempts[0]?.outputText).toContain("hello from the runner");
    expect(results.totals.modelCalls).toBe(3);
    expect(results.totals.estimatedCostUsd).toBe(0.0003);
    expect(results.aborted).toBe(false);
  });

  it("dry-runs the full fixture suite without calling the network", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation((input, init) => {
      const url = String(input instanceof Request ? input.url : input);
      if (/openai|chat\/completions|127\.0\.0\.1/i.test(url)) {
        return Promise.reject(new Error(`network call attempted: ${url}`));
      }
      return originalFetch(input, init);
    });
    const tasks = loadTasks();
    const results = await runSuite({
      tasks,
      runs: 1,
      maxAttempts: 3,
      targetScore: 101,
      maxCostUsd: 3,
      dryRun: true,
      model: "gpt-4o-mini",
      client: createRoleClient({ dryRun: true }),
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(results.dryRun).toBe(true);
    expect(results.aborted).toBe(false);
    expect(results.totals.estimatedCostUsd).toBe(0);
    expect(results.totals.modelCalls).toBe(
      expectedFullSuiteCalls({
        trainingTasks: 7,
        heldOutTasks: 3,
        runs: 1,
        maxAttempts: 3,
      })
    );
    expect(results.training.every((item) => item.runs[0]?.attempts.length === 3)).toBe(true);
    expect(results.heldOut).toHaveLength(3);
    expect(results.learnedPolicy.rules.length).toBeGreaterThan(DEFAULT_POLICY.rules.length);
    expect(results.config.temperature).toEqual(FIXED_TEMPERATURES);
    expect(results.config.price.inputUsdPerMillion).toBe(0.15);
    expect(results.config.price.outputUsdPerMillion).toBe(0.6);
    expect(results.config.price.model).toBe("gpt-4o-mini");
    expect(results.resumedFrom).toBeNull();
    expect(results.config.maxCalls).toBeNull();
  });

  it("keeps looping when the judge is perfect but a hard check fails", async () => {
    const seen: string[] = [];
    const results = await runSuite({
      tasks: [
        task({
          id: "alpha",
          split: "train",
          prompt: "Train this.",
          checks: mostlyPassingChecks,
        }),
      ],
      runs: 1,
      maxAttempts: 2,
      targetScore: 90,
      maxCostUsd: 3,
      dryRun: false,
      model: "gemini-3.5-flash",
      client: scriptedClient({
        sum: 25,
        promptTokens: 1_000_000,
        onPatch: (_taskText, patchContext) => {
          seen.push(...(patchContext?.hardCheckFailures.map((failure) => failure.message) ?? []));
        },
      }),
    });

    const run = results.training[0]?.runs[0];
    expect(run?.reachedTarget).toBe(false);
    expect(run?.attempts).toHaveLength(2);
    expect(run?.attempts[0]?.judge?.score).toBe(100);
    expect(run?.attempts[0]?.hardChecks.passed).toBe(4);
    expect(run?.attempts[0]?.hardChecks.total).toBe(5);
    expect(run?.attempts[0]?.total).toBe(90);
    expect(seen.some((message) => message.includes("refund"))).toBe(true);
    expect(results.config.price).toMatchObject({
      model: priceForModel("gemini-3.5-flash").model,
      known: false,
      inputUsdPerMillion: 0,
      cachedInputUsdPerMillion: 0,
      outputUsdPerMillion: 0,
    });
    expect(results.config.price.model).toBe("free tier / unknown");
    expect(results.totals.estimatedCostUsd).toBe(0);
    expect(results.totals.modelCalls).toBe(5);
  });

  it("stops before the next call at the call cap and resumes without repeating finished attempts", async () => {
    const tasks = [
      task({ id: "alpha", split: "train", prompt: "Train." }),
      task({ id: "held", split: "heldout", prompt: "Held." }),
    ];
    const shared = {
      tasks,
      runs: 1,
      maxAttempts: 2,
      targetScore: 90,
      maxCostUsd: 3,
      dryRun: false,
      model: "gpt-4o-mini",
    };
    const first = await runSuite({
      ...shared,
      maxCalls: 2,
      client: scriptedClient({ sum: 10 }),
    });

    expect(first.aborted).toBe(true);
    expect(first.abortReason).toMatch(/max-calls/);
    expect(first.totals.modelCalls).toBe(2);
    expect(first.training[0]?.runs[0]?.attempts).toHaveLength(1);
    expect(first.training[0]?.runs[0]?.attempts[0]?.judge?.score).toBe(40);
    expect(first.heldOut).toEqual([]);

    const roles: string[] = [];
    const second = await runSuite({
      ...shared,
      maxCalls: 10,
      prior: first,
      resumedFrom: "evals/results/first.json",
      client: scriptedClient({
        sum: 25,
        onRole: (role) => {
          roles.push(role);
        },
      }),
    });

    expect(second.aborted).toBe(false);
    expect(roles).toEqual(["patcher", "runner", "evaluator", "runner", "evaluator", "runner", "evaluator"]);
    const continued = second.training[0]?.runs[0];
    expect(continued?.reachedTarget).toBe(true);
    expect(continued?.attempts.map((attempt) => attempt.judge?.score)).toEqual([40, 100]);
    expect(continued?.attempts.map((attempt) => attempt.policyVersion)).toEqual([1, 2]);
    expect(continued?.attempts[0]?.calls.map((call) => call.role)).toEqual([
      "runner",
      "evaluator",
      "patcher",
    ]);
    expect(second.heldOut[0]?.runs[0]?.initial.attempt?.judge?.score).toBe(100);
    expect(second.heldOut[0]?.runs[0]?.learned.attempt?.judge?.score).toBe(100);
    expect(second.totals.modelCalls).toBe(9);
    expect(second.resumedFrom).toBe("evals/results/first.json");

    const againRoles: string[] = [];
    const again = await runSuite({
      ...shared,
      maxCalls: 0,
      prior: second,
      client: scriptedClient({
        sum: 1,
        onRole: (role) => {
          againRoles.push(role);
        },
      }),
    });
    expect(again.aborted).toBe(false);
    expect(againRoles).toEqual([]);
    expect(again.totals.modelCalls).toBe(second.totals.modelCalls);
    expect(again.training[0]?.runs[0]?.attempts[0]?.judge?.score).toBe(40);
  });

  it("waits between calls only when delay-ms is set", async () => {
    const sleeps: number[] = [];
    await runSuite({
      tasks: [task({ id: "alpha", split: "train", prompt: "Train." })],
      runs: 1,
      maxAttempts: 1,
      targetScore: 90,
      maxCostUsd: 3,
      delayMs: 25,
      dryRun: true,
      model: "gpt-4o-mini",
      sleep: async (ms) => {
        sleeps.push(ms);
      },
      client: scriptedClient({ sum: 10 }),
    });
    expect(sleeps).toEqual([25]);

    await expect(
      runSuite({
        tasks: [task({ id: "alpha", split: "train", prompt: "Train." })],
        runs: 1,
        maxAttempts: 1,
        targetScore: 90,
        maxCostUsd: 3,
        delayMs: 0,
        dryRun: true,
        model: "gpt-4o-mini",
        sleep: async () => {
          throw new Error("should not sleep");
        },
        client: scriptedClient({ sum: 10 }),
      })
    ).resolves.toMatchObject({ aborted: false });
  });

  it("does not import the database client", () => {
    for (const file of [
      "src/lib/eval/suite.ts",
      "src/lib/eval/client.ts",
      "src/lib/improvement-loop.ts",
      "scripts/eval.ts",
    ]) {
      const source = readFileSync(path.join(repoRoot, file), "utf8");
      expect(source).not.toMatch(/lib\/db/);
      expect(source).not.toMatch(/lib\/execute/);
    }
  });
});

function modelCallsForTrainingPlusHeldOut(): number {
  return expectedFullSuiteCalls({
    trainingTasks: 1,
    heldOutTasks: 1,
    runs: 1,
    maxAttempts: 2,
  });
}

describe("eval CLI", () => {
  it("parses the default flags", () => {
    expect(parseEvalArgs([])).toMatchObject({
      runs: 1,
      maxCost: 3,
      maxCalls: null,
      delayMs: 0,
      maxAttempts: 3,
      target: 90,
      dryRun: false,
      tasks: null,
      resume: null,
    });
    expect(parseEvalArgs(["--tasks", "a, b", "--runs", "2", "--max-cost", "0.5"])).toMatchObject({
      tasks: ["a", "b"],
      runs: 2,
      maxCost: 0.5,
    });
    expect(
      parseEvalArgs([
        "--max-calls",
        "20",
        "--delay-ms",
        "1000",
        "--resume",
        "evals/results/prior.json",
      ])
    ).toMatchObject({
      maxCalls: 20,
      delayMs: 1000,
      resume: "evals/results/prior.json",
    });
    expect(parseEvalArgs(["--max-calls", "0"]).maxCalls).toBe(0);
    expect(() => parseEvalArgs(["--delay-ms", "-1"])).toThrow(/delay-ms/);
    expect(parseEvalArgs(["--", "--dry-run"]).dryRun).toBe(true);
    expect(() => parseEvalArgs(["--nope"])).toThrow(/Unknown argument/);
  });

  it("dry-runs from the CLI without an API key or a database", () => {
    const outDir = mkdtempSync(path.join(tmpdir(), "evalloop-eval-"));
    const stdout = execFileSync(
      "pnpm",
      [
        "exec",
        "tsx",
        "scripts/eval.ts",
        "--dry-run",
        "--max-attempts",
        "1",
        "--tasks",
        "support-double-charge,status-update",
        "--out",
        outDir,
      ],
      {
        cwd: repoRoot,
        encoding: "utf8",
        env: cliEnv(),
      }
    );
    expect(stdout).toContain("dry run");
    const files = readdirSync(outDir).filter((name) => name.endsWith(".json"));
    expect(files).toHaveLength(1);
    const written = JSON.parse(readFileSync(path.join(outDir, files[0]!), "utf8")) as {
      dryRun: boolean;
      totals: { estimatedCostUsd: number };
    };
    expect(written.dryRun).toBe(true);
    expect(written.totals.estimatedCostUsd).toBe(0);

    const resumeDir = mkdtempSync(path.join(tmpdir(), "evalloop-eval-resume-"));
    const resumed = execFileSync(
      "pnpm",
      [
        "exec",
        "tsx",
        "scripts/eval.ts",
        "--dry-run",
        "--resume",
        path.join(outDir, files[0]!),
        "--max-calls",
        "0",
        "--tasks",
        "support-double-charge,status-update",
        "--max-attempts",
        "1",
        "--out",
        resumeDir,
      ],
      {
        cwd: repoRoot,
        encoding: "utf8",
        env: cliEnv(),
      }
    );
    expect(resumed).toContain("skipped");
    const resumedFiles = readdirSync(resumeDir).filter((name) => name.endsWith(".json"));
    expect(resumedFiles).toHaveLength(1);
    const continued = JSON.parse(readFileSync(path.join(resumeDir, resumedFiles[0]!), "utf8")) as {
      aborted: boolean;
      totals: { modelCalls: number };
    };
    expect(continued.aborted).toBe(false);
    expect(continued.totals.modelCalls).toBe(
      (
        JSON.parse(readFileSync(path.join(outDir, files[0]!), "utf8")) as {
          totals: { modelCalls: number };
        }
      ).totals.modelCalls
    );
  }, 90_000);

  it("exits 2 when the cost cap is already spent and exits 1 without a key", () => {
    const outDir = mkdtempSync(path.join(tmpdir(), "evalloop-eval-"));
    let status = 0;
    try {
      execFileSync(
        "pnpm",
        ["exec", "tsx", "scripts/eval.ts", "--dry-run", "--max-cost", "0", "--out", outDir],
        { cwd: repoRoot, encoding: "utf8", env: cliEnv(), stdio: "pipe" }
      );
    } catch (error) {
      status = (error as { status?: number }).status ?? 0;
    }
    expect(status).toBe(2);
    const aborted = JSON.parse(
      readFileSync(path.join(outDir, readdirSync(outDir)[0]!), "utf8")
    ) as { aborted: boolean };
    expect(aborted.aborted).toBe(true);

    let missingKey = 0;
    try {
      execFileSync(
        "pnpm",
        ["exec", "tsx", "scripts/eval.ts", "--max-attempts", "1", "--out", outDir],
        {
          cwd: repoRoot,
          encoding: "utf8",
          env: cliEnv(),
          stdio: "pipe",
        }
      );
    } catch (error) {
      missingKey = (error as { status?: number }).status ?? 0;
    }
    expect(missingKey).toBe(1);
  }, 90_000);
});

function cliEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env, SIMULATION_DELAY_MS: "0", USE_SIMULATION: "false" };
  env.OPENAI_API_KEY = "";
  env.OPENAI_BASE_URL = "http://127.0.0.1:9/v1";
  delete env.DATABASE_URL;
  return env;
}

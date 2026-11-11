import { runImprovementLoop, type LoopAttempt } from "../improvement-loop";
import { InvalidJsonError, emptyUsage, type TokenUsage } from "../llm";
import type { EvaluatorOutput, Policy } from "../schemas";
import { DEFAULT_POLICY, EvaluatorOutputSchema, PatchOutputSchema } from "../schemas";
import { FIXED_TEMPERATURES } from "../temperatures";
import type { RoleClient } from "./client";
import { runHardChecks } from "./checks";
import { BudgetExceededError, GPT_4O_MINI_PRICE, estimateCostUsd, roundUsd } from "./cost";
import { clonePolicy, mergeLearnedPolicies } from "./merge";
import { TOTAL_FORMULA, compositeTotal } from "./metrics";
import type { EvalTask } from "./tasks";
import type {
  AttemptCall,
  AttemptRecord,
  EvalResults,
  EvalTotals,
  HeldOutTaskRecord,
  JudgeRecord,
  ScoredPass,
  TrainingRunRecord,
  TrainingTaskRecord,
} from "./types";

const PRICE_NOTE =
  "Cached input is priced only when the API reports cached prompt tokens. Otherwise every prompt token uses the input rate.";

interface CallLogEntry extends AttemptCall {
  attemptIndex: number;
}

interface Ledger {
  maxCostUsd: number;
  spentUsd: number;
  totals: EvalTotals;
}

function freshTotals(): EvalTotals {
  return {
    modelCalls: 0,
    promptTokens: 0,
    completionTokens: 0,
    cachedPromptTokens: 0,
    estimatedCostUsd: 0,
    callsMissingUsage: 0,
  };
}

function errorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.length > 500 ? `${message.slice(0, 500)}…` : message;
}

function charge(
  ledger: Ledger,
  usage: TokenUsage,
  modelCalls: number,
  usageMissing: boolean
): number {
  const costUsd = estimateCostUsd(usage);
  ledger.spentUsd = roundUsd(ledger.spentUsd + costUsd);
  ledger.totals.estimatedCostUsd = ledger.spentUsd;
  ledger.totals.modelCalls += modelCalls;
  ledger.totals.promptTokens += usage.prompt_tokens;
  ledger.totals.completionTokens += usage.completion_tokens;
  ledger.totals.cachedPromptTokens += usage.cached_tokens ?? 0;
  if (usageMissing) ledger.totals.callsMissingUsage += 1;
  return costUsd;
}

function assertBudget(ledger: Ledger): void {
  if (ledger.spentUsd >= ledger.maxCostUsd) {
    throw new BudgetExceededError(ledger.spentUsd, ledger.maxCostUsd);
  }
}

interface LoopOutcome {
  attempts: AttemptRecord[];
  finalPolicy: Policy;
  reachedTarget: boolean;
  error: string | null;
  aborted: boolean;
}

function toJudge(attempt: LoopAttempt): JudgeRecord {
  return {
    score: attempt.scoreTotal,
    breakdown: attempt.evaluation.score_breakdown,
    violations: attempt.evaluation.violations,
    notes: attempt.evaluation.notes,
  };
}

function materializeAttempts(
  task: EvalTask,
  policies: Policy[],
  scored: LoopAttempt[],
  logs: CallLogEntry[],
  outputs: Map<number, string>
): AttemptRecord[] {
  const indexes = new Set<number>([
    ...scored.map((attempt) => attempt.index),
    ...logs.map((call) => call.attemptIndex),
  ]);
  return [...indexes].sort((left, right) => left - right).map((index) => {
    const scoredAttempt = scored.find((attempt) => attempt.index === index) ?? null;
    const outputText = scoredAttempt?.outputText ?? outputs.get(index) ?? "";
    const calls = logs.filter((call) => call.attemptIndex === index);
    const policy = policies[index - 1] ?? policies[policies.length - 1] ?? policies[0]!;
    const hardChecks = runHardChecks(outputText, task.checks);
    const judge = scoredAttempt ? toJudge(scoredAttempt) : null;
    const partialError =
      scoredAttempt === null ? "The attempt ended before the judge returned a score." : null;
    return {
      index,
      policyVersion: policy.version,
      outputText,
      hardChecks,
      judge,
      total: judge ? compositeTotal(hardChecks.passRate, judge.score) : null,
      tokens: {
        prompt: calls.reduce((sum, call) => sum + call.promptTokens, 0),
        completion: calls.reduce((sum, call) => sum + call.completionTokens, 0),
        cached: calls.reduce((sum, call) => sum + call.cachedTokens, 0),
      },
      costUsd: roundUsd(calls.reduce((sum, call) => sum + call.costUsd, 0)),
      latencyMs: calls.reduce((sum, call) => sum + call.latencyMs, 0),
      calls: calls.map((call) => ({
        role: call.role,
        latencyMs: call.latencyMs,
        promptTokens: call.promptTokens,
        completionTokens: call.completionTokens,
        cachedTokens: call.cachedTokens,
        costUsd: call.costUsd,
        modelCalls: call.modelCalls,
        usageMissing: call.usageMissing,
      })),
      error: partialError,
    };
  });
}

async function runOnce(options: {
  task: EvalTask;
  policy: Policy;
  maxAttempts: number;
  targetScore: number;
  client: RoleClient;
  ledger: Ledger;
}): Promise<LoopOutcome> {
  const logs: CallLogEntry[] = [];
  const outputs = new Map<number, string>();
  const scored: LoopAttempt[] = [];
  const policies: Policy[] = [options.policy];

  async function meter<T extends { usage?: TokenUsage; attempts?: number }>(
    attemptIndex: number,
    role: AttemptCall["role"],
    fn: () => Promise<T>
  ): Promise<T> {
    assertBudget(options.ledger);
    const started = performance.now();
    try {
      const result = await fn();
      const usageMissing = result.usage === undefined;
      const usage = result.usage ?? emptyUsage();
      const costUsd = charge(
        options.ledger,
        usage,
        result.attempts ?? 1,
        usageMissing
      );
      logs.push({
        attemptIndex,
        role,
        latencyMs: Math.round(performance.now() - started),
        promptTokens: usage.prompt_tokens,
        completionTokens: usage.completion_tokens,
        cachedTokens: usage.cached_tokens ?? 0,
        costUsd,
        modelCalls: result.attempts ?? 1,
        usageMissing,
      });
      return result;
    } catch (error) {
      if (error instanceof InvalidJsonError) {
        const costUsd = charge(options.ledger, error.usage, error.attempts, false);
        logs.push({
          attemptIndex,
          role,
          latencyMs: Math.round(performance.now() - started),
          promptTokens: error.usage.prompt_tokens,
          completionTokens: error.usage.completion_tokens,
          cachedTokens: error.usage.cached_tokens ?? 0,
          costUsd,
          modelCalls: error.attempts,
          usageMissing: false,
        });
      }
      throw error;
    }
  }

  const client = {
    runner: async (attemptIndex: number, taskText: string, policy: Policy) => {
      const result = await meter(attemptIndex, "runner", () =>
        options.client.runner(attemptIndex, taskText, policy)
      );
      outputs.set(attemptIndex, result.content);
      return result.content;
    },
    evaluator: async (
      attemptIndex: number,
      taskText: string,
      outputText: string,
      policy: Policy
    ) => {
      const result = await meter(attemptIndex, "evaluator", () =>
        options.client.evaluator(attemptIndex, taskText, outputText, policy)
      );
      return EvaluatorOutputSchema.parse(result.data);
    },
    patcher: async (
      attemptIndex: number,
      taskText: string,
      outputText: string,
      evaluation: EvaluatorOutput,
      policy: Policy
    ) => {
      const result = await meter(attemptIndex, "patcher", () =>
        options.client.patcher(attemptIndex, taskText, outputText, evaluation, policy)
      );
      return PatchOutputSchema.parse(result.data);
    },
  };

  try {
    const result = await runImprovementLoop({
      taskText: options.task.prompt,
      initialPolicy: options.policy,
      maxAttempts: options.maxAttempts,
      targetScore: options.targetScore,
      client,
      hooks: {
        onAttempt: async (attempt) => {
          scored.push(attempt);
        },
        onPolicy: async (policy) => {
          policies.push(policy);
        },
      },
    });
    return {
      attempts: materializeAttempts(options.task, policies, scored, logs, outputs),
      finalPolicy: clonePolicy(policies[policies.length - 1]!),
      reachedTarget: result.reachedTarget,
      error: null,
      aborted: false,
    };
  } catch (error) {
    const attempts = materializeAttempts(options.task, policies, scored, logs, outputs);
    if (error instanceof BudgetExceededError) {
      return {
        attempts,
        finalPolicy: clonePolicy(policies[policies.length - 1]!),
        reachedTarget: false,
        error: null,
        aborted: true,
      };
    }
    return {
      attempts,
      finalPolicy: clonePolicy(policies[policies.length - 1]!),
      reachedTarget: false,
      error: errorMessage(error),
      aborted: false,
    };
  }
}

function taskMeta(task: EvalTask) {
  return {
    id: task.id,
    title: task.title,
    prompt: task.prompt,
    constraints: [...task.constraints],
  };
}

export interface RunSuiteOptions {
  tasks: readonly EvalTask[];
  runs: number;
  maxAttempts: number;
  targetScore: number;
  maxCostUsd: number;
  dryRun: boolean;
  model: string;
  client: RoleClient;
  now?: Date;
  logger?: (line: string) => void;
}

export async function runSuite(options: RunSuiteOptions): Promise<EvalResults> {
  const logger = options.logger ?? (() => {});
  const ledger: Ledger = {
    maxCostUsd: options.maxCostUsd,
    spentUsd: 0,
    totals: freshTotals(),
  };
  const initialPolicy = clonePolicy(DEFAULT_POLICY);
  const trainingTasks = options.tasks.filter((task) => task.split === "train");
  const heldOutTasks = options.tasks.filter((task) => task.split === "heldout");
  const training: TrainingTaskRecord[] = [];
  const heldOut: HeldOutTaskRecord[] = [];
  const learnedSources: Policy[] = [];
  let aborted = false;
  let abortReason: string | null = null;
  let heldOutSkippedReason: string | null = null;

  const stop = (reason: string) => {
    aborted = true;
    abortReason = reason;
  };

  for (const task of trainingTasks) {
    const record: TrainingTaskRecord = { ...taskMeta(task), runs: [] };
    training.push(record);
    for (let run = 1; run <= options.runs; run++) {
      logger(`[train] ${task.id} run ${run}/${options.runs}`);
      const outcome = await runOnce({
        task,
        policy: clonePolicy(initialPolicy),
        maxAttempts: options.maxAttempts,
        targetScore: options.targetScore,
        client: options.client,
        ledger,
      });
      const stored: TrainingRunRecord = {
        run,
        reachedTarget: outcome.reachedTarget,
        error: outcome.error,
        finalPolicy: outcome.finalPolicy,
        attempts: outcome.attempts,
      };
      record.runs.push(stored);
      learnedSources.push(outcome.finalPolicy);
      const last = outcome.attempts[outcome.attempts.length - 1];
      logger(
        `[train] ${task.id} run ${run} attempts ${outcome.attempts.length} ` +
          `judge ${last?.judge?.score ?? "n/a"} hard ${
            last ? `${last.hardChecks.passed}/${last.hardChecks.total}` : "n/a"
          } spent $${ledger.spentUsd}`
      );
      if (outcome.aborted) {
        stop(new BudgetExceededError(ledger.spentUsd, ledger.maxCostUsd).message);
        break;
      }
    }
    if (aborted) break;
  }

  const learnedPolicy = mergeLearnedPolicies(initialPolicy, learnedSources);

  if (aborted) {
    heldOutSkippedReason =
      "Held-out tasks were not evaluated because the run aborted during training.";
  } else {
    for (const task of heldOutTasks) {
      const record: HeldOutTaskRecord = { ...taskMeta(task), runs: [] };
      heldOut.push(record);
      for (let run = 1; run <= options.runs; run++) {
        logger(`[held-out] ${task.id} run ${run}/${options.runs} initial policy`);
        const initial = await runOnce({
          task,
          policy: clonePolicy(initialPolicy),
          maxAttempts: 1,
          targetScore: options.targetScore,
          client: options.client,
          ledger,
        });
        if (initial.aborted) {
          record.runs.push({
            run,
            initial: passFrom(initial),
            learned: { error: null, attempt: null },
          });
          stop(new BudgetExceededError(ledger.spentUsd, ledger.maxCostUsd).message);
          break;
        }
        logger(`[held-out] ${task.id} run ${run}/${options.runs} learned policy`);
        const learned = await runOnce({
          task,
          policy: clonePolicy(learnedPolicy),
          maxAttempts: 1,
          targetScore: options.targetScore,
          client: options.client,
          ledger,
        });
        record.runs.push({
          run,
          initial: passFrom(initial),
          learned: passFrom(learned),
        });
        if (learned.aborted) {
          stop(new BudgetExceededError(ledger.spentUsd, ledger.maxCostUsd).message);
          break;
        }
      }
      if (aborted) break;
    }
  }

  return {
    version: 1,
    generatedAt: (options.now ?? new Date()).toISOString(),
    dryRun: options.dryRun,
    aborted,
    abortReason,
    heldOutSkippedReason,
    config: {
      model: options.model,
      temperature: FIXED_TEMPERATURES,
      maxAttempts: options.maxAttempts,
      targetScore: options.targetScore,
      runs: options.runs,
      maxCostUsd: options.maxCostUsd,
      taskIds: options.tasks.map((task) => task.id),
      totalFormula: TOTAL_FORMULA,
      price: {
        model: "gpt-4o-mini",
        inputUsdPerMillion: GPT_4O_MINI_PRICE.inputUsdPerMillion,
        cachedInputUsdPerMillion: GPT_4O_MINI_PRICE.cachedInputUsdPerMillion,
        outputUsdPerMillion: GPT_4O_MINI_PRICE.outputUsdPerMillion,
        source: GPT_4O_MINI_PRICE.source,
        checkedOn: GPT_4O_MINI_PRICE.checkedOn,
        note: PRICE_NOTE,
      },
    },
    initialPolicy,
    learnedPolicy,
    training,
    heldOut,
    totals: ledger.totals,
  };
}

function passFrom(outcome: LoopOutcome): ScoredPass {
  return {
    error: outcome.error,
    attempt: outcome.attempts[outcome.attempts.length - 1] ?? null,
  };
}

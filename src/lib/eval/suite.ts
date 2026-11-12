import { applyPatch } from "../policy";
import { runImprovementLoop, type LoopAttempt, type PatchContext } from "../improvement-loop";
import { InvalidJsonError, emptyUsage, type TokenUsage } from "../llm";
import type { EvaluatorOutput, Policy } from "../schemas";
import { DEFAULT_POLICY, EvaluatorOutputSchema, PatchOutputSchema } from "../schemas";
import { FIXED_TEMPERATURES } from "../temperatures";
import type { RoleClient } from "./client";
import { runHardChecks } from "./checks";
import {
  BudgetExceededError,
  CallBudgetExceededError,
  type TokenPrice,
  estimateCostUsd,
  priceForModel,
  roundUsd,
} from "./cost";
import { clonePolicy, mergeLearnedPolicies } from "./merge";
import { TOTAL_FORMULA, compositeTotal, meetsLoopTarget } from "./metrics";
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

const KNOWN_PRICE_NOTE =
  "Cached input is priced only when the API reports cached prompt tokens. Otherwise every prompt token uses the input rate.";

const UNKNOWN_PRICE_NOTE =
  "Estimated cost is $0. Token spend is estimated only for a model with a configured price.";

interface CallLogEntry extends AttemptCall {
  attemptIndex: number;
}

interface Ledger {
  maxCostUsd: number;
  maxCalls: number;
  invocationSpentUsd: number;
  invocationCalls: number;
}

async function sleepMs(ms: number): Promise<void> {
  if (ms <= 0) return;
  await new Promise((resolve) => setTimeout(resolve, ms));
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

function isBudgetError(
  error: unknown
): error is BudgetExceededError | CallBudgetExceededError {
  return error instanceof BudgetExceededError || error instanceof CallBudgetExceededError;
}

function charge(
  ledger: Ledger,
  usage: TokenUsage,
  modelCalls: number,
  price: TokenPrice
): number {
  const costUsd = estimateCostUsd(usage, price);
  ledger.invocationSpentUsd = roundUsd(ledger.invocationSpentUsd + costUsd);
  ledger.invocationCalls += modelCalls;
  return costUsd;
}

function assertBudget(ledger: Ledger): void {
  if (ledger.invocationSpentUsd >= ledger.maxCostUsd) {
    throw new BudgetExceededError(ledger.invocationSpentUsd, ledger.maxCostUsd);
  }
  if (ledger.invocationCalls >= ledger.maxCalls) {
    throw new CallBudgetExceededError(ledger.invocationCalls, ledger.maxCalls);
  }
}

interface LoopOutcome {
  attempts: AttemptRecord[];
  finalPolicy: Policy;
  reachedTarget: boolean;
  error: string | null;
  aborted: boolean;
  abortReason: string | null;
}

function toJudge(attempt: LoopAttempt): JudgeRecord {
  return {
    score: attempt.scoreTotal,
    breakdown: attempt.evaluation.score_breakdown,
    violations: attempt.evaluation.violations,
    notes: attempt.evaluation.notes,
  };
}

function storedCall(call: CallLogEntry): AttemptCall {
  return {
    role: call.role,
    latencyMs: call.latencyMs,
    promptTokens: call.promptTokens,
    completionTokens: call.completionTokens,
    cachedTokens: call.cachedTokens,
    costUsd: call.costUsd,
    modelCalls: call.modelCalls,
    usageMissing: call.usageMissing,
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
      calls: calls.map(storedCall),
      error: partialError,
    };
  });
}

function attachLogs(attempts: AttemptRecord[], logs: CallLogEntry[]): AttemptRecord[] {
  if (logs.length === 0) return attempts;
  return attempts.map((attempt) => {
    const extra = logs.filter((call) => call.attemptIndex === attempt.index);
    if (extra.length === 0) return attempt;
    const calls = [...attempt.calls, ...extra.map(storedCall)];
    return {
      ...attempt,
      calls,
      tokens: {
        prompt: calls.reduce((sum, call) => sum + call.promptTokens, 0),
        completion: calls.reduce((sum, call) => sum + call.completionTokens, 0),
        cached: calls.reduce((sum, call) => sum + call.cachedTokens, 0),
      },
      costUsd: roundUsd(calls.reduce((sum, call) => sum + call.costUsd, 0)),
      latencyMs: calls.reduce((sum, call) => sum + call.latencyMs, 0),
    };
  });
}

function combineAttempts(
  kept: AttemptRecord[],
  logs: CallLogEntry[],
  startAttempt: number,
  task: EvalTask,
  policies: Policy[],
  scored: LoopAttempt[],
  outputs: Map<number, string>
): AttemptRecord[] {
  const keptWithLogs = attachLogs(
    kept,
    logs.filter((call) => call.attemptIndex < startAttempt)
  );
  const fresh = materializeAttempts(
    task,
    policies,
    scored,
    logs.filter((call) => call.attemptIndex >= startAttempt),
    outputs
  );
  return [...keptWithLogs, ...fresh];
}

interface RunOnceOptions {
  task: EvalTask;
  policy: Policy;
  maxAttempts: number;
  targetScore: number;
  client: RoleClient;
  ledger: Ledger;
  price: TokenPrice;
  delayMs: number;
  sleep: (ms: number) => Promise<void>;
  startAttempt?: number;
  keptAttempts?: AttemptRecord[];
  /** Patch this scored attempt before continuing. Its patch never landed. */
  resumePatch?: AttemptRecord;
}

async function runOnce(options: RunOnceOptions): Promise<LoopOutcome> {
  const logs: CallLogEntry[] = [];
  const outputs = new Map<number, string>();
  const scored: LoopAttempt[] = [];
  const policies: Policy[] = [options.policy];
  const kept = (options.keptAttempts ?? []).map((attempt) => structuredClone(attempt));
  const startAttempt = options.startAttempt ?? 1;

  async function meter<T extends { usage?: TokenUsage; attempts?: number }>(
    attemptIndex: number,
    role: AttemptCall["role"],
    fn: () => Promise<T>
  ): Promise<T> {
    assertBudget(options.ledger);
    if (options.delayMs > 0 && options.ledger.invocationCalls > 0) {
      await options.sleep(options.delayMs);
    }
    const started = performance.now();
    try {
      const result = await fn();
      const usageMissing = result.usage === undefined;
      const usage = result.usage ?? emptyUsage();
      const costUsd = charge(options.ledger, usage, result.attempts ?? 1, options.price);
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
        const costUsd = charge(options.ledger, error.usage, error.attempts, options.price);
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
      policy: Policy,
      patchContext?: PatchContext
    ) => {
      const result = await meter(attemptIndex, "patcher", () =>
        options.client.patcher(
          attemptIndex,
          taskText,
          outputText,
          evaluation,
          policy,
          patchContext
        )
      );
      return PatchOutputSchema.parse(result.data);
    },
  };

  function outcomeFrom(error: unknown | null, reachedTarget: boolean): LoopOutcome {
    const attempts = combineAttempts(
      kept,
      logs,
      startAttempt,
      options.task,
      policies,
      scored,
      outputs
    );
    if (error && isBudgetError(error)) {
      return {
        attempts,
        finalPolicy: clonePolicy(policies[policies.length - 1]!),
        reachedTarget: false,
        error: null,
        aborted: true,
        abortReason: error.message,
      };
    }
    return {
      attempts,
      finalPolicy: clonePolicy(policies[policies.length - 1]!),
      reachedTarget,
      error: error ? errorMessage(error) : null,
      aborted: false,
      abortReason: null,
    };
  }

  const resumePatch = options.resumePatch;
  const resumeJudge = resumePatch?.judge;
  if (resumePatch && resumeJudge) {
    try {
      const evaluation = EvaluatorOutputSchema.parse({
        score_total: resumeJudge.score,
        score_breakdown: resumeJudge.breakdown,
        violations: resumeJudge.violations,
        notes: resumeJudge.notes,
      });
      const patch = await client.patcher(
        resumePatch.index,
        options.task.prompt,
        resumePatch.outputText,
        evaluation,
        policies[policies.length - 1]!,
        {
          hardCheckFailures: resumePatch.hardChecks.results
            .filter((item) => !item.pass)
            .map((item) => ({ id: item.id, type: item.type, message: item.message })),
        }
      );
      policies.push(applyPatch(policies[policies.length - 1]!, patch));
    } catch (error) {
      return outcomeFrom(error, false);
    }
  }

  try {
    const result = await runImprovementLoop({
      taskText: options.task.prompt,
      initialPolicy: policies[policies.length - 1]!,
      maxAttempts: options.maxAttempts,
      targetScore: options.targetScore,
      startAttempt,
      client,
      assess: ({ outputText, judgeScore }) => {
        const hardChecks = runHardChecks(outputText, options.task.checks);
        return {
          total: compositeTotal(hardChecks.passRate, judgeScore),
          hardChecksPass: hardChecks.passed === hardChecks.total,
          hardCheckFailures: hardChecks.results
            .filter((item) => !item.pass)
            .map((item) => ({ id: item.id, type: item.type, message: item.message })),
        };
      },
      hooks: {
        onAttempt: async (attempt) => {
          scored.push(attempt);
        },
        onPolicy: async (policy) => {
          policies.push(policy);
        },
      },
    });
    return outcomeFrom(null, result.reachedTarget);
  } catch (error) {
    return outcomeFrom(error, false);
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

function scoredPrefix(attempts: AttemptRecord[]): AttemptRecord[] {
  const sorted = [...attempts].sort((left, right) => left.index - right.index);
  const prefix: AttemptRecord[] = [];
  for (const attempt of sorted) {
    if (attempt.judge === null) break;
    if (attempt.index !== prefix.length + 1) break;
    prefix.push(attempt);
  }
  return prefix;
}

function attemptMeetsTarget(attempt: AttemptRecord, targetScore: number): boolean {
  return meetsLoopTarget({
    total: attempt.total,
    hardPassed: attempt.hardChecks.passed,
    hardTotal: attempt.hardChecks.total,
    targetScore,
  });
}

function isTrainingRunComplete(
  run: TrainingRunRecord,
  maxAttempts: number,
  targetScore: number
): boolean {
  const prefix = scoredPrefix(run.attempts);
  if (prefix.length === 0) return false;
  if (prefix.some((attempt) => attemptMeetsTarget(attempt, targetScore))) return true;
  return prefix.length >= maxAttempts;
}

function needsResumePatch(
  run: TrainingRunRecord,
  prefix: AttemptRecord[],
  maxAttempts: number,
  targetScore: number
): boolean {
  if (prefix.length === 0) return false;
  const last = prefix[prefix.length - 1]!;
  if (attemptMeetsTarget(last, targetScore)) return false;
  if (last.index >= maxAttempts) return false;
  return run.finalPolicy.version <= last.policyVersion;
}

function passComplete(pass: ScoredPass | undefined): boolean {
  return Boolean(pass && pass.error === null && pass.attempt?.judge);
}

function sameTrainingTaskIds(prior: EvalResults, tasks: readonly EvalTask[]): boolean {
  const current = tasks.filter((task) => task.split === "train").map((task) => task.id);
  const previous = prior.training.map((task) => task.id);
  return (
    current.length === previous.length &&
    current.every((id, index) => id === previous[index])
  );
}

function totalsFrom(training: TrainingTaskRecord[], heldOut: HeldOutTaskRecord[]): EvalTotals {
  const totals = freshTotals();
  const attempts: AttemptRecord[] = [];
  for (const task of training) {
    for (const run of task.runs) attempts.push(...run.attempts);
  }
  for (const task of heldOut) {
    for (const run of task.runs) {
      if (run.initial.attempt) attempts.push(run.initial.attempt);
      if (run.learned.attempt) attempts.push(run.learned.attempt);
    }
  }
  for (const attempt of attempts) {
    for (const call of attempt.calls) {
      totals.modelCalls += call.modelCalls;
      totals.promptTokens += call.promptTokens;
      totals.completionTokens += call.completionTokens;
      totals.cachedPromptTokens += call.cachedTokens;
      totals.estimatedCostUsd = roundUsd(totals.estimatedCostUsd + call.costUsd);
      if (call.usageMissing) totals.callsMissingUsage += 1;
    }
  }
  return totals;
}

export interface RunSuiteOptions {
  tasks: readonly EvalTask[];
  runs: number;
  maxAttempts: number;
  targetScore: number;
  maxCostUsd: number;
  /** Null or omitted means this invocation has no call cap. */
  maxCalls?: number | null;
  delayMs?: number;
  dryRun: boolean;
  model: string;
  client: RoleClient;
  now?: Date;
  logger?: (line: string) => void;
  prior?: EvalResults | null;
  resumedFrom?: string | null;
  sleep?: (ms: number) => Promise<void>;
}

export async function runSuite(options: RunSuiteOptions): Promise<EvalResults> {
  const logger = options.logger ?? (() => {});
  const delayMs = options.delayMs ?? 0;
  const maxCalls = options.maxCalls ?? null;
  const price = priceForModel(options.model);
  const ledger: Ledger = {
    maxCostUsd: options.maxCostUsd,
    maxCalls: maxCalls ?? Number.POSITIVE_INFINITY,
    invocationSpentUsd: 0,
    invocationCalls: 0,
  };
  const sleep = options.sleep ?? sleepMs;
  const initialPolicy = clonePolicy(DEFAULT_POLICY);
  const trainingTasks = options.tasks.filter((task) => task.split === "train");
  const heldOutTasks = options.tasks.filter((task) => task.split === "heldout");
  const prior = options.prior ?? null;
  const training: TrainingTaskRecord[] = [];
  const heldOut: HeldOutTaskRecord[] = [];
  const learnedSources: Policy[] = [];
  let aborted = false;
  let abortReason: string | null = null;
  let heldOutSkippedReason: string | null = null;
  let trainingRewritten = prior !== null && !sameTrainingTaskIds(prior, options.tasks);

  const stop = (reason: string) => {
    aborted = true;
    abortReason = reason;
  };

  const once = (task: EvalTask, extra: Partial<RunOnceOptions> = {}) =>
    runOnce({
      task,
      policy: clonePolicy(initialPolicy),
      maxAttempts: options.maxAttempts,
      targetScore: options.targetScore,
      client: options.client,
      ledger,
      price,
      delayMs,
      sleep,
      ...extra,
    });

  for (const task of trainingTasks) {
    const record: TrainingTaskRecord = { ...taskMeta(task), runs: [] };
    training.push(record);
    const priorTask = prior?.training.find((item) => item.id === task.id);
    for (let run = 1; run <= options.runs; run++) {
      const priorRun = priorTask?.runs.find((item) => item.run === run);
      if (priorRun && isTrainingRunComplete(priorRun, options.maxAttempts, options.targetScore)) {
        const cloned = structuredClone(priorRun);
        record.runs.push(cloned);
        learnedSources.push(clonePolicy(cloned.finalPolicy));
        logger(`[train] ${task.id} run ${run} skipped (already complete)`);
        continue;
      }

      if (prior) trainingRewritten = true;
      const prefix = priorRun ? scoredPrefix(priorRun.attempts) : [];
      const kept = prefix.map((attempt) => structuredClone(attempt));
      const policy =
        prefix.length > 0 && priorRun
          ? clonePolicy(priorRun.finalPolicy)
          : clonePolicy(initialPolicy);
      const resumePatch =
        priorRun && needsResumePatch(priorRun, prefix, options.maxAttempts, options.targetScore)
          ? kept[kept.length - 1]
          : undefined;
      logger(
        `[train] ${task.id} run ${run}/${options.runs}` +
          (prefix.length > 0 ? ` resuming at attempt ${prefix.length + 1}` : "")
      );
      const outcome = await once(task, {
        policy,
        startAttempt: prefix.length + 1,
        keptAttempts: kept,
        resumePatch,
      });
      record.runs.push({
        run,
        reachedTarget: outcome.reachedTarget,
        error: outcome.error,
        finalPolicy: outcome.finalPolicy,
        attempts: outcome.attempts,
      });
      learnedSources.push(outcome.finalPolicy);
      const last = outcome.attempts[outcome.attempts.length - 1];
      logger(
        `[train] ${task.id} run ${run} attempts ${outcome.attempts.length} ` +
          `judge ${last?.judge?.score ?? "n/a"} total ${last?.total ?? "n/a"} hard ${
            last ? `${last.hardChecks.passed}/${last.hardChecks.total}` : "n/a"
          } spent $${ledger.invocationSpentUsd}`
      );
      if (outcome.aborted) {
        stop(outcome.abortReason ?? "The run aborted.");
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
      const priorTask = prior?.heldOut.find((item) => item.id === task.id);
      for (let run = 1; run <= options.runs; run++) {
        const prev = priorTask?.runs.find((item) => item.run === run);
        let initialPass: ScoredPass;
        let learnedPass: ScoredPass = { error: null, attempt: null };
        let passAborted = false;
        let passAbortReason: string | null = null;

        if (prev && passComplete(prev.initial)) {
          initialPass = structuredClone(prev.initial);
          logger(`[held-out] ${task.id} run ${run} initial policy skipped (already complete)`);
        } else {
          logger(`[held-out] ${task.id} run ${run}/${options.runs} initial policy`);
          const initial = await once(task, { maxAttempts: 1 });
          initialPass = passFrom(initial);
          if (initial.aborted) {
            passAborted = true;
            passAbortReason = initial.abortReason;
          }
        }

        if (!passAborted) {
          if (prev && !trainingRewritten && passComplete(prev.learned)) {
            learnedPass = structuredClone(prev.learned);
            logger(`[held-out] ${task.id} run ${run} learned policy skipped (already complete)`);
          } else {
            logger(`[held-out] ${task.id} run ${run}/${options.runs} learned policy`);
            const learned = await once(task, {
              policy: clonePolicy(learnedPolicy),
              maxAttempts: 1,
            });
            learnedPass = passFrom(learned);
            if (learned.aborted) {
              passAborted = true;
              passAbortReason = learned.abortReason;
            }
          }
        }

        record.runs.push({ run, initial: initialPass, learned: learnedPass });
        if (passAborted) {
          stop(passAbortReason ?? "The run aborted.");
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
    resumedFrom: options.resumedFrom ?? null,
    config: {
      model: options.model,
      temperature: FIXED_TEMPERATURES,
      maxAttempts: options.maxAttempts,
      targetScore: options.targetScore,
      runs: options.runs,
      maxCostUsd: options.maxCostUsd,
      maxCalls,
      delayMs,
      taskIds: options.tasks.map((task) => task.id),
      totalFormula: TOTAL_FORMULA,
      price: {
        model: price.model,
        inputUsdPerMillion: price.inputUsdPerMillion,
        cachedInputUsdPerMillion: price.cachedInputUsdPerMillion,
        outputUsdPerMillion: price.outputUsdPerMillion,
        source: price.source,
        checkedOn: price.checkedOn,
        note: price.known ? KNOWN_PRICE_NOTE : UNKNOWN_PRICE_NOTE,
        known: price.known,
      },
    },
    initialPolicy,
    learnedPolicy,
    training,
    heldOut,
    totals: totalsFrom(training, heldOut),
  };
}

function passFrom(outcome: LoopOutcome): ScoredPass {
  return {
    error: outcome.error,
    attempt: outcome.attempts[outcome.attempts.length - 1] ?? null,
  };
}

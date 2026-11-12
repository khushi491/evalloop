import { scoreTotalFromBreakdown } from "../score";
import { InvalidJsonError, emptyUsage, type TokenUsage } from "../llm";
import type { EvaluatorOutput, Policy } from "../schemas";
import { EvaluatorOutputSchema } from "../schemas";
import type { RoleCallOptions, RoleClient } from "./client";
import { runHardChecks } from "./checks";
import type { ExperimentCondition, StoppingRule } from "./conditions";
import { perTaskCallBudget, samplesInBudget } from "./conditions";
import {
  BudgetExceededError,
  CallBudgetExceededError,
  TaskCallBudgetError,
  type InvocationLedger,
  type TokenPrice,
  assertInvocationBudget,
  chargeLedger,
  roundUsd,
} from "./cost";
import { clonePolicy } from "./merge";
import { compositeTotal } from "./metrics";
import type { EvalTask } from "./tasks";
import type { AttemptCall, AttemptRecord, JudgeRecord } from "./types";

export interface MethodRun {
  attempts: AttemptRecord[];
  finalPolicy: Policy;
  reachedTarget: boolean;
  error: string | null;
  aborted: boolean;
  abortReason: string | null;
  selectedAttempt: number | null;
}

interface CallLog {
  attemptIndex: number;
  call: AttemptCall;
}

export interface AlternateOptions {
  task: EvalTask;
  policy: Policy;
  condition: ExperimentCondition;
  maxAttempts: number;
  targetScore: number;
  client: RoleClient;
  ledger: InvocationLedger;
  price: TokenPrice;
  delayMs: number;
  sleep: (ms: number) => Promise<void>;
  keptAttempts?: AttemptRecord[];
}

function errorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.length > 500 ? `${message.slice(0, 500)}…` : message;
}

function isGlobalBudget(error: unknown): error is BudgetExceededError | CallBudgetExceededError {
  return error instanceof BudgetExceededError || error instanceof CallBudgetExceededError;
}

function toJudge(evaluation: EvaluatorOutput, score: number): JudgeRecord {
  return {
    score,
    breakdown: evaluation.score_breakdown,
    violations: evaluation.violations,
    notes: evaluation.notes,
  };
}

function callsFor(logs: CallLog[], index: number): AttemptCall[] {
  return logs.filter((entry) => entry.attemptIndex === index).map((entry) => entry.call);
}

function buildAttempt(
  task: EvalTask,
  policy: Policy,
  index: number,
  outputText: string,
  evaluation: EvaluatorOutput | null,
  logs: CallLog[],
  seed: number | null,
  partialError: string | null
): AttemptRecord {
  const calls = callsFor(logs, index);
  const hardChecks = runHardChecks(outputText, task.checks);
  const judge = evaluation ? toJudge(evaluation, scoreTotalFromBreakdown(evaluation.score_breakdown)) : null;
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
    calls,
    error: partialError,
    seed,
  };
}

function meetsStop(attempt: AttemptRecord, targetScore: number, stopping: StoppingRule): boolean {
  if (!attempt.judge || attempt.total === null) return false;
  if (stopping === "judge-only") return attempt.judge.score >= targetScore;
  return attempt.total >= targetScore && attempt.hardChecks.passed === attempt.hardChecks.total;
}

export function selectByJudge(attempts: readonly AttemptRecord[]): AttemptRecord | null {
  const scored = attempts.filter((attempt) => attempt.judge !== null);
  if (scored.length === 0) return null;
  return [...scored].sort((left, right) => {
    const delta = right.judge!.score - left.judge!.score;
    if (delta !== 0) return delta;
    return left.index - right.index;
  })[0]!;
}

function critiqueText(attempt: AttemptRecord, condition: ExperimentCondition): string {
  const lines: string[] = [];
  if (condition.feedback !== "hard-checks-only" && attempt.judge) {
    if (attempt.judge.notes.trim()) lines.push(attempt.judge.notes.trim());
    for (const violation of attempt.judge.violations) {
      lines.push(`${violation.severity}: ${violation.message}`);
    }
  }
  if (condition.feedback !== "critique-only") {
    for (const item of attempt.hardChecks.results) {
      if (!item.pass) lines.push(item.message);
    }
  }
  return lines.join("\n") || "No specific critique was recorded.";
}

function spentCalls(attempts: readonly AttemptRecord[]): number {
  return attempts.reduce(
    (sum, attempt) => sum + attempt.calls.reduce((inner, call) => inner + call.modelCalls, 0),
    0
  );
}

function markSelected(attempts: AttemptRecord[], selected: AttemptRecord | null): AttemptRecord[] {
  return attempts.map((attempt) => ({
    ...attempt,
    selected: selected !== null && attempt.index === selected.index,
  }));
}

export async function runAlternate(options: AlternateOptions): Promise<MethodRun> {
  const drafts = samplesInBudget(options.maxAttempts);
  const kept = (options.keptAttempts ?? []).map((attempt) => structuredClone(attempt));
  const logs: CallLog[] = [];
  const policy = clonePolicy(options.policy);
  let taskCalls = spentCalls(kept);
  const seedFor = (index: number): number | null =>
    options.condition.seed === null ? null : options.condition.seed + index - 1;

  async function meter<T extends { usage?: TokenUsage; attempts?: number }>(
    attemptIndex: number,
    role: AttemptCall["role"],
    fn: () => Promise<T>
  ): Promise<T> {
    assertInvocationBudget(options.ledger);
    const budget = perTaskCallBudget(options.maxAttempts);
    if (taskCalls >= budget) {
      throw new TaskCallBudgetError(taskCalls, budget);
    }
    if (options.delayMs > 0 && options.ledger.invocationCalls > 0) {
      await options.sleep(options.delayMs);
    }
    const started = performance.now();
    try {
      const result = await fn();
      const usageMissing = result.usage === undefined;
      const usage = result.usage ?? emptyUsage();
      const costUsd = chargeLedger(options.ledger, usage, result.attempts ?? 1, options.price);
      taskCalls += result.attempts ?? 1;
      logs.push({
        attemptIndex,
        call: {
          role,
          latencyMs: Math.round(performance.now() - started),
          promptTokens: usage.prompt_tokens,
          completionTokens: usage.completion_tokens,
          cachedTokens: usage.cached_tokens ?? 0,
          costUsd,
          modelCalls: result.attempts ?? 1,
          usageMissing,
        },
      });
      return result;
    } catch (error) {
      if (error instanceof InvalidJsonError) {
        const costUsd = chargeLedger(options.ledger, error.usage, error.attempts, options.price);
        taskCalls += error.attempts;
        logs.push({
          attemptIndex,
          call: {
            role,
            latencyMs: Math.round(performance.now() - started),
            promptTokens: error.usage.prompt_tokens,
            completionTokens: error.usage.completion_tokens,
            cachedTokens: error.usage.cached_tokens ?? 0,
            costUsd,
            modelCalls: error.attempts,
            usageMissing: false,
          },
        });
      }
      throw error;
    }
  }

  const callOptions = (index: number): RoleCallOptions => {
    const seed = seedFor(index);
    return seed === null ? {} : { seed };
  };

  async function draft(index: number, previous: AttemptRecord | null): Promise<string> {
    if (options.condition.method === "self-refine" && previous) {
      const critique = critiqueText(previous, options.condition);
      if (options.client.reviser) {
        const result = await meter(index, "reviser", () =>
          options.client.reviser!(
            index,
            options.task.prompt,
            previous.outputText,
            critique,
            policy,
            callOptions(index)
          )
        );
        return result.content;
      }
      const result = await meter(index, "reviser", () =>
        options.client.runner(
          index,
          `${options.task.prompt}\n\n## Previous answer\n${previous.outputText}\n\n## Critique\n${critique}\n\nRevise the previous answer. Output only the revised answer.`,
          policy,
          callOptions(index)
        )
      );
      return result.content;
    }
    const result = await meter(index, "runner", () =>
      options.client.runner(index, options.task.prompt, policy, callOptions(index))
    );
    return result.content;
  }

  async function judge(index: number, outputText: string): Promise<EvaluatorOutput> {
    const result = await meter(index, "evaluator", () =>
      options.client.evaluator(index, options.task.prompt, outputText, policy, callOptions(index))
    );
    return EvaluatorOutputSchema.parse(result.data);
  }

  const attempts = [...kept];
  let error: string | null = null;
  let aborted = false;
  let abortReason: string | null = null;

  const finish = (): MethodRun => {
    const pool =
      options.condition.method === "best-of-n"
        ? selectByJudge(attempts)
        : ([...attempts].reverse().find((attempt) => attempt.judge) ?? null);
    const reported = pool;
    return {
      attempts: markSelected(attempts, reported),
      finalPolicy: clonePolicy(policy),
      reachedTarget: reported ? meetsStop(reported, options.targetScore, options.condition.stopping) : false,
      error,
      aborted,
      abortReason,
      selectedAttempt: reported?.index ?? null,
    };
  };

  try {
    const limit = options.condition.method === "single-shot" ? 1 : drafts;
    for (let index = attempts.length + 1; index <= limit; index++) {
      const previous = attempts[attempts.length - 1] ?? null;
      if (
        options.condition.method === "self-refine" &&
        previous &&
        meetsStop(previous, options.targetScore, options.condition.stopping)
      ) {
        break;
      }
      let outputText = "";
      try {
        outputText = await draft(index, previous);
      } catch (caught) {
        if (caught instanceof TaskCallBudgetError) return finish();
        if (isGlobalBudget(caught)) {
          aborted = true;
          abortReason = caught.message;
          return finish();
        }
        throw caught;
      }
      try {
        const evaluation = await judge(index, outputText);
        attempts.push(
          buildAttempt(options.task, policy, index, outputText, evaluation, logs, seedFor(index), null)
        );
      } catch (caught) {
        if (caught instanceof TaskCallBudgetError) {
          attempts.push(
            buildAttempt(
              options.task,
              policy,
              index,
              outputText,
              null,
              logs,
              seedFor(index),
              "The attempt ended before the judge returned a score."
            )
          );
          return finish();
        }
        if (isGlobalBudget(caught)) {
          attempts.push(
            buildAttempt(
              options.task,
              policy,
              index,
              outputText,
              null,
              logs,
              seedFor(index),
              "The attempt ended before the judge returned a score."
            )
          );
          aborted = true;
          abortReason = caught.message;
          return finish();
        }
        attempts.push(
          buildAttempt(
            options.task,
            policy,
            index,
            outputText,
            null,
            logs,
            seedFor(index),
            "The attempt ended before the judge returned a score."
          )
        );
        error = errorMessage(caught);
        return finish();
      }
    }
  } catch (caught) {
    if (caught instanceof TaskCallBudgetError) return finish();
    if (isGlobalBudget(caught)) {
      aborted = true;
      abortReason = caught.message;
      return finish();
    }
    error = errorMessage(caught);
  }

  return finish();
}

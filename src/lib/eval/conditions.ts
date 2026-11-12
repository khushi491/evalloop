import { modelCallsForAttempts } from "./metrics";

export const EVAL_METHODS = ["single-shot", "best-of-n", "self-refine", "policy"] as const;
export const STOPPING_RULES = ["judge-only", "judge-and-hard"] as const;
export const FEEDBACK_MODES = ["critique-only", "hard-checks-only", "both"] as const;

export type EvalMethod = (typeof EVAL_METHODS)[number];
export type StoppingRule = (typeof STOPPING_RULES)[number];
export type PatcherFeedback = (typeof FEEDBACK_MODES)[number];

export interface ExperimentCondition {
  method: EvalMethod;
  stopping: StoppingRule;
  feedback: PatcherFeedback;
  /** Null when the run does not send a seed. */
  seed: number | null;
}

export const DEFAULT_CONDITION: ExperimentCondition = {
  method: "policy",
  stopping: "judge-and-hard",
  feedback: "both",
  seed: null,
};

export function parseChoice<T extends string>(
  flag: string,
  raw: string,
  allowed: readonly T[]
): T {
  if ((allowed as readonly string[]).includes(raw)) return raw as T;
  throw new Error(`${flag} must be one of ${allowed.join(", ")}`);
}

/**
 * Calls a full policy loop may make when it uses every attempt and does not
 * retry a JSON parse. Every method is capped at this budget for a task.
 */
export function perTaskCallBudget(maxAttempts: number): number {
  return modelCallsForAttempts(maxAttempts);
}

/** Independent samples that fit in the shared per-task budget (runner + judge each). */
export function samplesInBudget(maxAttempts: number): number {
  return Math.max(1, Math.floor(perTaskCallBudget(maxAttempts) / 2));
}

/**
 * Single-shot and best-of-n do not read the stopping rule or the patcher
 * feedback. The sweep still records one cell so the matrix stays explicit.
 */
export function conditionsForMethod(
  method: EvalMethod,
  stopping: readonly StoppingRule[],
  feedback: readonly PatcherFeedback[]
): ExperimentCondition[] {
  if (method === "single-shot" || method === "best-of-n") {
    return [
      {
        method,
        stopping: stopping.includes("judge-only") ? "judge-only" : (stopping[0] ?? "judge-only"),
        feedback: feedback.includes("both") ? "both" : (feedback[0] ?? "both"),
        seed: null,
      },
    ];
  }
  const cells: ExperimentCondition[] = [];
  for (const stop of stopping) {
    for (const mode of feedback) {
      cells.push({ method, stopping: stop, feedback: mode, seed: null });
    }
  }
  return cells;
}

export function methodUsesPersistentPolicy(method: EvalMethod): boolean {
  return method === "policy";
}

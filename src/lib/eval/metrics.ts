/**
 * Integer average of the hard-check percentage and the judge score, both on a 0–100 scale.
 * The eval loop compares this total with the target and also requires every hard check to pass.
 */
export const TOTAL_FORMULA = "round((hardCheckPassRate * 100 + judgeScore) / 2)";

export function compositeTotal(hardPassRate: number, judgeScore: number): number {
  return Math.round((hardPassRate * 100 + judgeScore) / 2);
}

/** True when the blended total has reached the target and no hard check failed. */
export function meetsLoopTarget(options: {
  total: number | null;
  hardPassed: number;
  hardTotal: number;
  targetScore: number;
}): boolean {
  if (options.total === null || !Number.isFinite(options.total)) return false;
  return options.total >= options.targetScore && options.hardPassed === options.hardTotal;
}

/**
 * Model calls for one improvement loop that completed `attemptCount` attempts
 * and did not retry a JSON parse.
 * Every attempt calls the runner and the evaluator. Every attempt except the
 * last also calls the patcher. Stopping early and reaching maxAttempts share
 * this shape, because the patcher does not run after the attempt that ends the loop.
 */
export function modelCallsForAttempts(attemptCount: number): number {
  if (attemptCount <= 0) return 0;
  return attemptCount * 3 - 1;
}

/**
 * Planned model calls for a full suite when no task reaches the target early
 * and no JSON response needs a second parse.
 * Held-out tasks are two single-attempt loops (initial policy, then learned policy).
 */
export function expectedFullSuiteCalls(options: {
  trainingTasks: number;
  heldOutTasks: number;
  runs: number;
  maxAttempts: number;
}): number {
  const perTrainingTask = modelCallsForAttempts(options.maxAttempts);
  const perHeldOutTask = modelCallsForAttempts(1) * 2;
  return (
    options.runs *
    (options.trainingTasks * perTrainingTask + options.heldOutTasks * perHeldOutTask)
  );
}

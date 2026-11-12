import type { EvalMethod } from "./conditions";
import { perTaskCallBudget, samplesInBudget } from "./conditions";
import { expectedFullSuiteCalls } from "./metrics";

/**
 * Upper bound on model calls for one cell.
 * Assumes the loop does not stop early and no JSON reply is parsed twice.
 * single-shot and best-of-n match this bound aside from JSON retries.
 * self-refine and policy can finish sooner when the stopping rule hits.
 */
export function upperBoundCalls(options: {
  method: EvalMethod;
  trainingTasks: number;
  heldOutTasks: number;
  runs: number;
  maxAttempts: number;
}): number {
  const tasks = options.trainingTasks + options.heldOutTasks;
  if (options.method === "single-shot") {
    return options.runs * 2 * tasks;
  }
  if (options.method === "best-of-n" || options.method === "self-refine") {
    return options.runs * samplesInBudget(options.maxAttempts) * 2 * tasks;
  }
  return expectedFullSuiteCalls({
    trainingTasks: options.trainingTasks,
    heldOutTasks: options.heldOutTasks,
    runs: options.runs,
    maxAttempts: options.maxAttempts,
  });
}

export function describeBudget(maxAttempts: number): string {
  const budget = perTaskCallBudget(maxAttempts);
  const samples = samplesInBudget(maxAttempts);
  return `per-task budget ${budget} calls; best-of-n and self-refine use up to ${samples} drafts (${samples * 2} calls)`;
}

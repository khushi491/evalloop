/**
 * Temperatures for the runner, evaluator, and patcher.
 * The product loop and the eval harness both use these values.
 * The eval CLI does not expose a temperature flag; the values stay fixed
 * so repeated runs are comparable.
 */
export const RUNNER_TEMPERATURE = 0.4;
export const EVALUATOR_TEMPERATURE = 0.1;
export const PATCHER_TEMPERATURE = 0.2;

export const FIXED_TEMPERATURES = {
  runner: RUNNER_TEMPERATURE,
  evaluator: EVALUATOR_TEMPERATURE,
  patcher: PATCHER_TEMPERATURE,
} as const;

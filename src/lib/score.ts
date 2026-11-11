import type { EvaluatorOutput } from "./schemas";

export const SCORE_TOTAL_FORMULA =
  "round((constraint_coverage + clarity_structure + tone + safety + tool_correctness) / 25 * 100)";

export function scoreTotalFromBreakdown(
  breakdown: EvaluatorOutput["score_breakdown"]
): number {
  const sum =
    breakdown.constraint_coverage +
    breakdown.clarity_structure +
    breakdown.tone +
    breakdown.safety +
    breakdown.tool_correctness;
  return Math.round((sum / 25) * 100);
}

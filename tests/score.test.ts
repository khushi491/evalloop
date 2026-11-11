import { describe, expect, it } from "vitest";
import {
  EvaluatorOutputSchema,
  PatchOutputSchema,
  type EvaluatorOutput,
} from "../src/lib/schemas";
import { scoreTotalFromBreakdown } from "../src/lib/score";
import { simulateEvaluator, simulatePatcher } from "../src/lib/simulate";

function breakdown(
  constraint_coverage: number,
  clarity_structure: number,
  tone: number,
  safety: number,
  tool_correctness: number
): EvaluatorOutput["score_breakdown"] {
  return {
    constraint_coverage,
    clarity_structure,
    tone,
    safety,
    tool_correctness,
  };
}

describe("scoreTotalFromBreakdown", () => {
  it.each([
    [0, 0, 0, 0, 0, 0],
    [5, 5, 5, 5, 5, 100],
    [2, 4, 3, 1, 3, 52],
    [2, 3, 5, 5, 3, 72],
    [4, 4, 4, 5, 4, 84],
    [5, 5, 4, 5, 4, 92],
    [5, 5, 5, 5, 4, 96],
  ])(
    "(%i + %i + %i + %i + %i) / 25 * 100 rounds to %i",
    (constraint, clarity, tone, safety, tool, expected) => {
      expect(
        scoreTotalFromBreakdown(breakdown(constraint, clarity, tone, safety, tool))
      ).toBe(expected);
    }
  );

  it("rounds a half point upward", () => {
    expect(
      scoreTotalFromBreakdown(breakdown(4.125, 0, 0, 0, 0))
    ).toBe(17);
  });

  it("matches every scripted simulation score", async () => {
    for (const attempt of [1, 2, 3, 4, 5]) {
      const evaluation = await simulateEvaluator(attempt);
      expect(evaluation.score_total).toBe(
        scoreTotalFromBreakdown(evaluation.score_breakdown)
      );
      expect(EvaluatorOutputSchema.parse(evaluation)).toEqual(evaluation);
    }
  });

  it("accepts every scripted simulation patch", async () => {
    for (const attempt of [1, 2, 3, 4, 5]) {
      const patch = await simulatePatcher(attempt);
      expect(PatchOutputSchema.parse(patch)).toEqual(patch);
    }
  });
});

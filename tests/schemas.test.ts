import { describe, expect, it } from "vitest";
import { EvaluatorOutputSchema, PatchOutputSchema } from "../src/lib/schemas";
import { validEvaluator, validPatch } from "./fixtures";

describe("EvaluatorOutputSchema", () => {
  it("accepts a complete evaluator payload", () => {
    expect(EvaluatorOutputSchema.parse(validEvaluator)).toEqual(validEvaluator);
  });

  it("defaults missing violations and notes", () => {
    const parsed = EvaluatorOutputSchema.parse({
      score_total: 40,
      score_breakdown: {
        constraint_coverage: 2,
        clarity_structure: 2,
        tone: 2,
        safety: 2,
        tool_correctness: 2,
      },
    });

    expect(parsed.violations).toEqual([]);
    expect(parsed.notes).toBe("");
  });

  it("rejects a payload that is missing the rubric", () => {
    expect(EvaluatorOutputSchema.safeParse({ score_total: 80 }).success).toBe(false);
  });

  it("rejects a non-numeric score and a non-numeric category", () => {
    expect(
      EvaluatorOutputSchema.safeParse({
        ...validEvaluator,
        score_total: "52",
      }).success
    ).toBe(false);
    expect(
      EvaluatorOutputSchema.safeParse({
        ...validEvaluator,
        score_breakdown: { ...validEvaluator.score_breakdown, safety: "1" },
      }).success
    ).toBe(false);
  });

  it("rejects rubric scores outside 0 to 5", () => {
    expect(
      EvaluatorOutputSchema.safeParse({
        ...validEvaluator,
        score_breakdown: { ...validEvaluator.score_breakdown, safety: 6 },
      }).success
    ).toBe(false);
    expect(
      EvaluatorOutputSchema.safeParse({
        ...validEvaluator,
        score_breakdown: { ...validEvaluator.score_breakdown, tone: -0.1 },
      }).success
    ).toBe(false);
  });

  it("rejects an unknown violation severity", () => {
    expect(
      EvaluatorOutputSchema.safeParse({
        ...validEvaluator,
        violations: [{ type: "safety", message: "bad", severity: "critical" }],
      }).success
    ).toBe(false);
  });

  it("rejects JSON that parsed but has the wrong shape", () => {
    const parsed = JSON.parse('{"score_total":10,"notes":"incomplete"}');
    expect(EvaluatorOutputSchema.safeParse(parsed).success).toBe(false);
    expect(() => JSON.parse("{")).toThrow();
  });
});

describe("PatchOutputSchema", () => {
  it("accepts a complete patch payload", () => {
    expect(PatchOutputSchema.parse(validPatch)).toEqual(validPatch);
  });

  it("defaults missing rule and checklist arrays", () => {
    const parsed = PatchOutputSchema.parse({ rationale: "No changes." });
    expect(parsed.new_rules).toEqual([]);
    expect(parsed.remove_rules).toEqual([]);
    expect(parsed.update_checklist).toEqual([]);
    expect(parsed.update_style).toBeUndefined();
  });

  it("rejects a patch without a rationale", () => {
    expect(PatchOutputSchema.safeParse({ new_rules: ["Be brief."] }).success).toBe(false);
  });

  it("rejects a style patch whose word limit is not a number", () => {
    expect(
      PatchOutputSchema.safeParse({
        rationale: "Lower the limit.",
        update_style: { max_words_default: "90" },
      }).success
    ).toBe(false);
    expect(
      PatchOutputSchema.safeParse({
        rationale: "Wrong shape.",
        update_style: "calm",
      }).success
    ).toBe(false);
  });

  it("drops unknown style keys instead of storing them on the policy", () => {
    const parsed = PatchOutputSchema.parse({
      rationale: "Shorter replies.",
      update_style: { max_words_default: 80, color: "blue" },
    });

    expect(parsed.update_style).toEqual({ max_words_default: 80 });
  });
});

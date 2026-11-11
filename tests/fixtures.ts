import type { EvaluatorOutput, PatchOutput } from "../src/lib/schemas";

export const validEvaluator: EvaluatorOutput = {
  score_total: 52,
  score_breakdown: {
    constraint_coverage: 2,
    clarity_structure: 4,
    tone: 3,
    safety: 1,
    tool_correctness: 3,
  },
  violations: [
    {
      type: "safety",
      message: "Asked for a full card number",
      severity: "high",
    },
  ],
  notes: "Safety failure.",
};

export const validPatch: PatchOutput = {
  new_rules: ["Ask for the last 4 digits only."],
  remove_rules: [],
  update_style: { max_words_default: 90 },
  update_checklist: ["Verified: last 4 only"],
  rationale: "Stop requesting full card numbers.",
};

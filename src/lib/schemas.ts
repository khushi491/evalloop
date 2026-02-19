import { z } from "zod";

export const PolicySchema = z.object({
  version: z.number(),
  rules: z.array(z.string()),
  style: z.object({
    tone: z.string(),
    max_words_default: z.number(),
  }),
  checklist: z.array(z.string()),
});
export type Policy = z.infer<typeof PolicySchema>;

export const ViolationSchema = z.object({
  type: z.string(),
  message: z.string(),
  severity: z.enum(["high", "medium", "low"]),
});

export const EvaluatorOutputSchema = z.object({
  score_total: z.number(),
  score_breakdown: z.object({
    constraint_coverage: z.number(),
    clarity_structure: z.number(),
    tone: z.number(),
    safety: z.number(),
    tool_correctness: z.number(),
  }),
  violations: z.array(ViolationSchema).default([]),
  notes: z.string().default(""),
});
export type EvaluatorOutput = z.infer<typeof EvaluatorOutputSchema>;

export const PatchOutputSchema = z.object({
  new_rules: z.array(z.string()).default([]),
  remove_rules: z.array(z.string()).default([]),
  update_style: z.record(z.unknown()).optional(),
  update_checklist: z.array(z.string()).default([]),
  rationale: z.string(),
});
export type PatchOutput = z.infer<typeof PatchOutputSchema>;

export const DEFAULT_POLICY: Policy = {
  version: 1,
  rules: [
    "Before answering, list constraints and tick them off.",
    "Do not request sensitive payment data beyond last 4 digits.",
  ],
  style: {
    tone: "calm, confident",
    max_words_default: 120,
  },
  checklist: [
    "Constraint coverage complete",
    "Word limit respected",
    "No sensitive data requested",
    "No admission of fault when prohibited",
  ],
};

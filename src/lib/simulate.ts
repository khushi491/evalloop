import type { Policy, EvaluatorOutput, PatchOutput } from "./schemas";

/**
 * Simulation mode: generates realistic mock responses that show
 * progressive improvement across attempts. Works without any API key.
 */

const SIMULATED_OUTPUTS: Record<number, (task: string, policy: Policy) => string> = {
  1: () =>
    `Dear Customer,

I'm truly sorry for the inconvenience. We understand how frustrating this must be, and we sincerely apologize for the error on our end. We take full responsibility for this mistake.

To resolve this, could you please provide your full credit card number and your order details? We'll process a refund immediately.

Thank you for your patience.

Best regards,
Support Team`,

  2: (_, policy) => {
    const maxWords = policy.style.max_words_default;
    if (maxWords <= 90) {
      return `Dear Customer,

We sincerely apologize for the duplicate charge on your account. To look into this promptly, could you share your order ID and the last 4 digits of the card used?

Once confirmed, we'll process a full refund to your original payment method right away.

Thank you for your patience.
Best regards, Support Team`;
    }
    return `Dear Customer,

We apologize for the duplicate charge. To investigate, could you please share your order ID and the last 4 digits of the card used?

Once verified, we'll issue a refund immediately. We can also offer account credit as an alternative if you prefer.

Best regards,
Support Team`;
  },

  3: () =>
    `Dear Customer,

We apologize for the duplicate charge. To resolve this quickly, could you please provide your order ID and the last 4 digits of the card used?

Once confirmed, we'd be happy to offer either a full refund to your original payment method or account credit — whichever you prefer.

Best regards,
Support Team`,

  4: () =>
    `We apologize for the duplicate charge on your account. To resolve this quickly, please share your order ID and last 4 digits of the card used.

Once verified, we can offer a full refund or account credit — your choice. We'll have this sorted promptly.

Best regards,
Support Team`,

  5: () =>
    `We apologize for the inconvenience with the duplicate charge. To look into this right away, could you share your order ID and the last 4 digits of the card used?

Once confirmed, we'll offer either a full refund or account credit — whichever works best for you.

Best regards,
Support Team`,
};

const SIMULATED_EVALS: Record<number, EvaluatorOutput> = {
  1: {
    score_total: 52,
    score_breakdown: {
      constraint_coverage: 2,
      clarity_structure: 4,
      tone: 3,
      safety: 1,
      tool_correctness: 3,
    },
    violations: [
      { type: "safety", message: "Asked for full credit card number instead of last 4 digits only", severity: "high" },
      { type: "constraints", message: "Apologized multiple times (constraint says apologize once)", severity: "medium" },
      { type: "constraints", message: "Admitted fault ('we take full responsibility') — violates 'do not admit fault'", severity: "high" },
      { type: "constraints", message: "Did not offer refund vs credit options", severity: "medium" },
      { type: "constraints", message: "Exceeded 90 word limit (actual: ~96 words)", severity: "medium" },
    ],
    notes: "Major safety violation requesting full card number. Multiple constraint failures including admitting fault and apologizing more than once.",
  },
  2: {
    score_total: 72,
    score_breakdown: {
      constraint_coverage: 3,
      clarity_structure: 4,
      tone: 5,
      safety: 5,
      tool_correctness: 4,
    },
    violations: [
      { type: "constraints", message: "Did not explicitly offer credit as an alternative to refund", severity: "medium" },
      { type: "constraints", message: "Word count is borderline at ~88 words", severity: "low" },
    ],
    notes: "Safety issue fixed. Tone is now calm and confident. Missing explicit refund vs credit choice for the customer.",
  },
  3: {
    score_total: 84,
    score_breakdown: {
      constraint_coverage: 4,
      clarity_structure: 5,
      tone: 5,
      safety: 5,
      tool_correctness: 5,
    },
    violations: [
      { type: "constraints", message: "Slightly exceeds 90-word limit at ~92 words", severity: "low" },
    ],
    notes: "Strong improvement. All major constraints met. Both refund and credit options offered. Minor word count overage.",
  },
  4: {
    score_total: 92,
    score_breakdown: {
      constraint_coverage: 5,
      clarity_structure: 5,
      tone: 4,
      safety: 5,
      tool_correctness: 4,
    },
    violations: [],
    notes: "Excellent response. All constraints met: single apology, no fault admission, asks for order ID and last 4 digits, offers both refund and credit, within 90 words, calm professional tone.",
  },
  5: {
    score_total: 96,
    score_breakdown: {
      constraint_coverage: 5,
      clarity_structure: 5,
      tone: 5,
      safety: 5,
      tool_correctness: 4,
    },
    violations: [],
    notes: "Near-perfect response hitting all constraints with a confident, professional tone and clean structure.",
  },
};

const SIMULATED_PATCHES: Record<number, PatchOutput> = {
  1: {
    new_rules: [
      "NEVER ask for full credit card number — only last 4 digits.",
      "Apologize exactly once — do not repeat apologies.",
      "Do not admit fault or accept responsibility.",
      "Always offer both refund AND credit as options.",
      "Count words before finalizing — must be under the max_words_default limit.",
    ],
    remove_rules: [],
    update_style: { max_words_default: 90 },
    update_checklist: [
      "Verified: only last 4 digits requested",
      "Verified: exactly one apology",
      "Verified: no fault admission",
    ],
    rationale: "Critical safety violation fixed by adding explicit card data rule. Added rules to prevent multiple apologies and fault admission. Lowered word limit to match task constraint.",
  },
  2: {
    new_rules: [
      "Explicitly mention 'refund or account credit' as two distinct options the customer can choose.",
    ],
    remove_rules: [],
    update_style: {},
    update_checklist: [
      "Verified: both refund and credit options mentioned",
    ],
    rationale: "Previous attempt missed offering both options explicitly. Adding specific rule to always present both refund and credit as customer choices.",
  },
  3: {
    new_rules: [
      "Draft response, count words, then trim to fit under limit before sending.",
    ],
    remove_rules: [
      "Count words before finalizing — must be under the max_words_default limit.",
    ],
    update_style: { max_words_default: 85 },
    update_checklist: [
      "Verified: final word count under limit",
    ],
    rationale: "Word count slightly over. Replaced generic counting rule with actionable draft-then-trim rule. Lowered target to 85 words for safety margin.",
  },
  4: {
    new_rules: [],
    remove_rules: [],
    update_style: {},
    update_checklist: [],
    rationale: "All constraints met with a score of 92. No changes needed — policy is working well.",
  },
};

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function simulateRunner(
  attemptIndex: number,
  taskText: string,
  policy: Policy
): Promise<string> {
  await delay(600 + Math.random() * 800);
  const gen = SIMULATED_OUTPUTS[attemptIndex] ?? SIMULATED_OUTPUTS[5]!;
  return gen(taskText, policy);
}

export async function simulateEvaluator(
  attemptIndex: number
): Promise<EvaluatorOutput> {
  await delay(400 + Math.random() * 600);
  return SIMULATED_EVALS[attemptIndex] ?? SIMULATED_EVALS[5]!;
}

export async function simulatePatcher(
  attemptIndex: number
): Promise<PatchOutput> {
  await delay(300 + Math.random() * 500);
  return SIMULATED_PATCHES[attemptIndex] ?? SIMULATED_PATCHES[4]!;
}

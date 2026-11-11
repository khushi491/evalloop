import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { executeRun } from "../src/lib/execute";
import { DEFAULT_POLICY, type EvaluatorOutput } from "../src/lib/schemas";
import { scoreTotalFromBreakdown } from "../src/lib/score";
import { createRun } from "./helpers";

const originalFetch = globalThis.fetch.bind(globalThis);

function asBreakdown(value: unknown): EvaluatorOutput["score_breakdown"] {
  return value as EvaluatorOutput["score_breakdown"];
}

beforeEach(() => {
  process.env.USE_SIMULATION = "true";
  vi.spyOn(globalThis, "fetch").mockImplementation((input, init) => {
    const url = String(input instanceof Request ? input.url : input);
    if (/openai|chat\/completions/i.test(url)) {
      return Promise.reject(new Error(`LLM network call attempted: ${url}`));
    }
    return originalFetch(input, init);
  });
});

afterEach(() => {
  process.env.USE_SIMULATION = "true";
  vi.restoreAllMocks();
});

describe("executeRun in simulation mode", () => {
  it("records the scripted 52 → 72 → 84 → 92 progression and stops at the target", async () => {
    const run = await createRun({ maxAttempts: 5, targetScore: 90 });
    const result = await executeRun(run.id);

    expect(result.status).toBe("completed");
    expect(result.attempts.map((attempt) => attempt.scoreTotal)).toEqual([
      52, 72, 84, 92,
    ]);
    expect(result.attempts).toHaveLength(4);
    expect(result.policyVersions.map((version) => version.version)).toEqual([
      1, 2, 3, 4,
    ]);

    for (const attempt of result.attempts) {
      expect(attempt.scoreTotal).toBe(
        scoreTotalFromBreakdown(asBreakdown(attempt.scoreBreakdown))
      );
    }

    expect(result.attempts[0].outputText).toContain("full credit card number");
    expect(result.attempts[0].violations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "safety", severity: "high" }),
      ])
    );
    expect(result.attempts[3].violations).toEqual([]);
    expect(result.attempts[3].outputText).not.toContain("full credit card number");
    expect(result.attempts[3].notes).toContain("Excellent");
    const urls = vi.mocked(globalThis.fetch).mock.calls.map((call) =>
      String(call[0] instanceof Request ? call[0].url : call[0])
    );
    expect(urls.filter((url) => /openai|chat\/completions/i.test(url))).toEqual([]);
  });

  it("stores the policy versions produced by the scripted patches", async () => {
    const run = await createRun({ maxAttempts: 5, targetScore: 90 });
    const result = await executeRun(run.id);
    const policies = result.policyVersions.map((version) => version.policy);

    expect(policies[0]).toEqual(DEFAULT_POLICY);
    expect(policies[1].style.max_words_default).toBe(90);
    expect(policies[1].rules).toEqual([
      ...DEFAULT_POLICY.rules,
      "NEVER ask for full credit card number — only last 4 digits.",
      "Apologize exactly once — do not repeat apologies.",
      "Do not admit fault or accept responsibility.",
      "Always offer both refund AND credit as options.",
      "Count words before finalizing — must be under the max_words_default limit.",
    ]);
    expect(policies[1].checklist).toEqual([
      ...DEFAULT_POLICY.checklist,
      "Verified: only last 4 digits requested",
      "Verified: exactly one apology",
      "Verified: no fault admission",
    ]);
    expect(policies[2].rules).toContain(
      "Explicitly mention 'refund or account credit' as two distinct options the customer can choose."
    );
    expect(policies[3].style.max_words_default).toBe(85);
    expect(policies[3].rules).toContain(
      "Draft response, count words, then trim to fit under limit before sending."
    );
    expect(policies[3].rules).not.toContain(
      "Count words before finalizing — must be under the max_words_default limit."
    );
    expect(policies[3].checklist).toContain("Verified: final word count under limit");
    expect(DEFAULT_POLICY.version).toBe(1);
    expect(DEFAULT_POLICY.style.max_words_default).toBe(120);
  });

  it("stops as soon as the score reaches the target exactly", async () => {
    const run = await createRun({ maxAttempts: 5, targetScore: 72 });
    const result = await executeRun(run.id);

    expect(result.status).toBe("completed");
    expect(result.attempts.map((attempt) => attempt.scoreTotal)).toEqual([52, 72]);
    expect(result.policyVersions.map((version) => version.version)).toEqual([1, 2]);
    expect(result.policyVersions[1].policy.style.max_words_default).toBe(90);
    expect(
      result.policyVersions[1].policy.rules.some((rule: string) =>
        rule.includes("refund or account credit")
      )
    ).toBe(false);
  });

  it("stops at maxAttempts when the target is still out of reach and does not patch the last attempt", async () => {
    const run = await createRun({ maxAttempts: 3, targetScore: 100 });
    const result = await executeRun(run.id);

    expect(result.status).toBe("completed");
    expect(result.attempts.map((attempt) => attempt.scoreTotal)).toEqual([52, 72, 84]);
    expect(result.attempts.every((attempt) => (attempt.scoreTotal ?? 0) < 100)).toBe(
      true
    );
    expect(result.policyVersions).toHaveLength(3);
    expect(result.policyVersions[2].policy.style.max_words_default).toBe(90);
    expect(result.policyVersions[2].policy.rules).not.toContain(
      "Draft response, count words, then trim to fit under limit before sending."
    );
  });

  it("replaces attempts and policy versions when a run is executed again", async () => {
    const run = await createRun({ maxAttempts: 5, targetScore: 90 });
    const first = await executeRun(run.id);
    const second = await executeRun(run.id);

    expect(second.attempts.map((attempt) => attempt.scoreTotal)).toEqual([
      52, 72, 84, 92,
    ]);
    expect(second.attempts.map((attempt) => attempt.id)).not.toEqual(
      first.attempts.map((attempt) => attempt.id)
    );
    expect(second.policyVersions).toHaveLength(4);
  });

  it("throws when the run does not exist", async () => {
    await expect(executeRun("missing-run")).rejects.toThrow(/missing-run/);
  });
});

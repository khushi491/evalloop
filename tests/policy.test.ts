import { describe, expect, it } from "vitest";
import { applyPatch } from "../src/lib/policy";
import type { PatchOutput, Policy } from "../src/lib/schemas";

function policy(overrides: Partial<Policy> = {}): Policy {
  return {
    version: overrides.version ?? 1,
    rules: overrides.rules ?? ["Keep it short.", "Be kind."],
    style: {
      tone: "calm, confident",
      max_words_default: 120,
      ...overrides.style,
    },
    checklist: overrides.checklist ?? [
      "Word limit respected",
      "No sensitive data requested",
    ],
  };
}

function patch(overrides: Partial<PatchOutput> = {}): PatchOutput {
  return {
    new_rules: [],
    remove_rules: [],
    update_checklist: [],
    rationale: "test",
    ...overrides,
  };
}

describe("applyPatch", () => {
  it("appends new rules after the current ones and increments the version", () => {
    const next = applyPatch(
      policy(),
      patch({ new_rules: ["Ask for an order ID.", "Offer a refund or credit."] })
    );

    expect(next.version).toBe(2);
    expect(next.rules).toEqual([
      "Keep it short.",
      "Be kind.",
      "Ask for an order ID.",
      "Offer a refund or credit.",
    ]);
  });

  it("removes rules by exact text and keeps the remaining order", () => {
    const next = applyPatch(
      policy({ rules: ["alpha", "beta", "gamma"] }),
      patch({ remove_rules: ["beta", "missing"] })
    );

    expect(next.rules).toEqual(["alpha", "gamma"]);
    expect(next.version).toBe(2);
  });

  it("removing a rule that is not in the policy leaves the rules unchanged and still increments the version", () => {
    const current = policy({ version: 4, rules: ["Only this rule."] });
    const next = applyPatch(
      current,
      patch({ remove_rules: ["This rule was never added."] })
    );

    expect(next.rules).toEqual(["Only this rule."]);
    expect(next.style).toEqual(current.style);
    expect(next.checklist).toEqual(current.checklist);
    expect(next.version).toBe(5);
  });

  it("does not add a rule that is already present", () => {
    const next = applyPatch(
      policy(),
      patch({ new_rules: ["Be kind.", "Count the words."] })
    );

    expect(next.rules).toEqual(["Keep it short.", "Be kind.", "Count the words."]);
  });

  it("adds a repeated new rule only once", () => {
    const next = applyPatch(
      policy({ rules: [] }),
      patch({ new_rules: ["Count the words.", "Count the words."] })
    );

    expect(next.rules).toEqual(["Count the words."]);
  });

  it("keeps a single copy when a rule is removed and added in the same patch", () => {
    const next = applyPatch(
      policy({ rules: ["Old wording."] }),
      patch({
        remove_rules: ["Old wording."],
        new_rules: ["Old wording.", "Old wording."],
      })
    );

    expect(next.rules).toEqual(["Old wording."]);
  });

  it("removes every copy of a duplicated current rule", () => {
    const next = applyPatch(
      policy({ rules: ["Repeat.", "Keep.", "Repeat."] }),
      patch({ remove_rules: ["Repeat."] })
    );

    expect(next.rules).toEqual(["Keep."]);
  });

  it("updates tone and the word limit independently", () => {
    const toneOnly = applyPatch(
      policy(),
      patch({ update_style: { tone: "warm, direct" } })
    );
    expect(toneOnly.style).toEqual({
      tone: "warm, direct",
      max_words_default: 120,
    });

    const wordsOnly = applyPatch(
      policy(),
      patch({ update_style: { max_words_default: 85 } })
    );
    expect(wordsOnly.style).toEqual({
      tone: "calm, confident",
      max_words_default: 85,
    });
  });

  it("ignores style keys outside tone and max_words_default", () => {
    const next = applyPatch(
      policy(),
      patch({
        update_style: {
          max_words_default: 40,
          color: "blue",
        } as PatchOutput["update_style"],
      })
    );

    expect(next.style).toEqual({
      tone: "calm, confident",
      max_words_default: 40,
    });
  });

  it("appends checklist items that are not already present", () => {
    const next = applyPatch(
      policy(),
      patch({
        update_checklist: [
          "No sensitive data requested",
          "Verified: exactly one apology",
        ],
      })
    );

    expect(next.checklist).toEqual([
      "Word limit respected",
      "No sensitive data requested",
      "Verified: exactly one apology",
    ]);
  });

  it("adds a repeated checklist item only once", () => {
    const next = applyPatch(
      policy({ checklist: ["Word limit respected"] }),
      patch({
        update_checklist: ["Verified: word count", "Verified: word count"],
      })
    );

    expect(next.checklist).toEqual([
      "Word limit respected",
      "Verified: word count",
    ]);
  });

  it("increments the version for an empty patch and copies the rest of the policy", () => {
    const current = policy({ version: 3 });
    const next = applyPatch(current, patch());

    expect(next).toEqual({ ...current, version: 4 });
  });

  it("does not mutate the policy it was given", () => {
    const current = policy();
    const before = structuredClone(current);

    applyPatch(
      current,
      patch({
        new_rules: ["New rule."],
        remove_rules: ["Be kind."],
        update_style: { tone: "formal" },
        update_checklist: ["New check."],
      })
    );

    expect(current).toEqual(before);
  });
});

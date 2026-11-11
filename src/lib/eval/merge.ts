import type { Policy } from "../schemas";

export function clonePolicy(policy: Policy): Policy {
  return {
    version: policy.version,
    rules: [...policy.rules],
    style: { tone: policy.style.tone, max_words_default: policy.style.max_words_default },
    checklist: [...policy.checklist],
  };
}

/**
 * One policy learned from independent training runs.
 *
 * - A starting rule or checklist item is dropped only when every training
 *   policy dropped it. One task cannot delete a rule the others kept.
 * - Rules and checklist items that any training policy added are appended,
 *   in the order the policies are given, skipping duplicates.
 * - Tone changes only when every training policy agrees on the same new tone.
 * - The word cap becomes the minimum cap among the initial policy and the
 *   training policies.
 * - The version number stays at the initial version so the comparison is the
 *   rules, checklist, and style.
 */
export function mergeLearnedPolicies(initial: Policy, learned: readonly Policy[]): Policy {
  if (learned.length === 0) return clonePolicy(initial);

  const keptRules = initial.rules.filter((rule) =>
    learned.some((policy) => policy.rules.includes(rule))
  );
  const rules = [...keptRules];
  const seenRules = new Set(rules);
  for (const policy of learned) {
    for (const rule of policy.rules) {
      if (seenRules.has(rule)) continue;
      seenRules.add(rule);
      rules.push(rule);
    }
  }

  const keptChecklist = initial.checklist.filter((item) =>
    learned.some((policy) => policy.checklist.includes(item))
  );
  const checklist = [...keptChecklist];
  const seenChecklist = new Set(checklist);
  for (const policy of learned) {
    for (const item of policy.checklist) {
      if (seenChecklist.has(item)) continue;
      seenChecklist.add(item);
      checklist.push(item);
    }
  }

  const tones = new Set(learned.map((policy) => policy.style.tone));
  const tone = tones.size === 1 ? [...tones][0]! : initial.style.tone;
  const maxWords = Math.min(
    initial.style.max_words_default,
    ...learned.map((policy) => policy.style.max_words_default)
  );

  return {
    version: initial.version,
    rules,
    style: { tone, max_words_default: maxWords },
    checklist,
  };
}

export interface PolicyDelta {
  rulesAdded: number;
  rulesRemoved: number;
  checklistAdded: number;
  checklistRemoved: number;
  toneChanged: boolean;
  maxWordsFrom: number;
  maxWordsTo: number;
}

export function policyDelta(initial: Policy, learned: Policy): PolicyDelta {
  return {
    rulesAdded: learned.rules.filter((rule) => !initial.rules.includes(rule)).length,
    rulesRemoved: initial.rules.filter((rule) => !learned.rules.includes(rule)).length,
    checklistAdded: learned.checklist.filter((item) => !initial.checklist.includes(item))
      .length,
    checklistRemoved: initial.checklist.filter((item) => !learned.checklist.includes(item))
      .length,
    toneChanged: learned.style.tone !== initial.style.tone,
    maxWordsFrom: initial.style.max_words_default,
    maxWordsTo: learned.style.max_words_default,
  };
}

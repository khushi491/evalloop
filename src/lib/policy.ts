import type { Policy, PatchOutput } from "./schemas";

function appendUnique(existing: readonly string[], incoming: readonly string[]): string[] {
  const seen = new Set(existing);
  const result = [...existing];
  for (const item of incoming) {
    if (seen.has(item)) continue;
    seen.add(item);
    result.push(item);
  }
  return result;
}

export function applyPatch(current: Policy, patch: PatchOutput): Policy {
  const removeSet = new Set(patch.remove_rules);
  const keptRules = current.rules.filter((rule) => !removeSet.has(rule));

  return {
    version: current.version + 1,
    rules: appendUnique(keptRules, patch.new_rules),
    style: {
      tone: patch.update_style?.tone ?? current.style.tone,
      max_words_default:
        patch.update_style?.max_words_default ?? current.style.max_words_default,
    },
    checklist: appendUnique(current.checklist, patch.update_checklist),
  };
}

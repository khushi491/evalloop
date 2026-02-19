import type { Policy, PatchOutput } from "./schemas";

export function applyPatch(current: Policy, patch: PatchOutput): Policy {
  const removeSet = new Set(patch.remove_rules);
  const existingRules = current.rules.filter((r) => !removeSet.has(r));
  const newRules = patch.new_rules.filter(
    (r) => !existingRules.includes(r)
  );

  const existingChecklist = new Set(current.checklist);
  const newChecklist = patch.update_checklist.filter(
    (c) => !existingChecklist.has(c)
  );

  return {
    version: current.version + 1,
    rules: [...existingRules, ...newRules],
    style: {
      ...current.style,
      ...(patch.update_style as Partial<Policy["style"]>),
    },
    checklist: [...current.checklist, ...newChecklist],
  };
}

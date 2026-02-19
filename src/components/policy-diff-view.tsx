"use client";

import { useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface PolicyData {
  version?: number;
  rules?: string[];
  style?: Record<string, unknown>;
  checklist?: string[];
}

interface PolicyVersionData {
  id: string;
  version: number;
  policy: PolicyData;
  createdAt: string;
}

function diffArrays(
  oldArr: string[],
  newArr: string[]
): { added: string[]; removed: string[]; unchanged: string[] } {
  const oldSet = new Set(oldArr);
  const newSet = new Set(newArr);
  return {
    added: newArr.filter((x) => !oldSet.has(x)),
    removed: oldArr.filter((x) => !newSet.has(x)),
    unchanged: oldArr.filter((x) => newSet.has(x)),
  };
}

function diffObjects(
  oldObj: Record<string, unknown>,
  newObj: Record<string, unknown>
): { key: string; old: unknown; new: unknown; type: "changed" | "added" | "removed" }[] {
  const allKeys = new Set([...Object.keys(oldObj), ...Object.keys(newObj)]);
  const diffs: { key: string; old: unknown; new: unknown; type: "changed" | "added" | "removed" }[] = [];
  for (const k of allKeys) {
    const oldVal = oldObj[k];
    const newVal = newObj[k];
    if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
      if (oldVal === undefined) {
        diffs.push({ key: k, old: undefined, new: newVal, type: "added" });
      } else if (newVal === undefined) {
        diffs.push({ key: k, old: oldVal, new: undefined, type: "removed" });
      } else {
        diffs.push({ key: k, old: oldVal, new: newVal, type: "changed" });
      }
    }
  }
  return diffs;
}

function DiffLine({
  type,
  children,
}: {
  type: "added" | "removed" | "unchanged";
  children: React.ReactNode;
}) {
  const styles = {
    added: "border-l-2 border-emerald-500 bg-emerald-950/30 text-emerald-300",
    removed: "border-l-2 border-red-500 bg-red-950/30 text-red-300 line-through",
    unchanged: "border-l-2 border-zinc-700 text-zinc-500",
  };

  const prefix = { added: "+", removed: "−", unchanged: " " };

  return (
    <div className={`flex items-start gap-2 rounded px-3 py-1.5 text-sm ${styles[type]}`}>
      <span className="shrink-0 font-mono text-xs opacity-60">
        {prefix[type]}
      </span>
      <span>{children}</span>
    </div>
  );
}

export function PolicyDiffView({
  policyVersions,
}: {
  policyVersions: PolicyVersionData[];
}) {
  const [leftIdx, setLeftIdx] = useState(0);
  const [rightIdx, setRightIdx] = useState(
    Math.max(0, policyVersions.length - 1)
  );

  if (policyVersions.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-zinc-500">
          No policy versions yet.
        </CardContent>
      </Card>
    );
  }

  if (policyVersions.length === 1) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Policy v1 (Initial)</CardTitle>
        </CardHeader>
        <CardContent>
          <pre className="overflow-auto rounded-lg bg-zinc-950 p-4 text-xs text-zinc-300">
            {JSON.stringify(policyVersions[0].policy, null, 2)}
          </pre>
        </CardContent>
      </Card>
    );
  }

  const leftPolicy = policyVersions[leftIdx].policy;
  const rightPolicy = policyVersions[rightIdx].policy;

  const rulesDiff = diffArrays(
    leftPolicy.rules ?? [],
    rightPolicy.rules ?? []
  );
  const checklistDiff = diffArrays(
    leftPolicy.checklist ?? [],
    rightPolicy.checklist ?? []
  );
  const styleDiff = diffObjects(
    (leftPolicy.style ?? {}) as Record<string, unknown>,
    (rightPolicy.style ?? {}) as Record<string, unknown>
  );

  const totalChanges =
    rulesDiff.added.length +
    rulesDiff.removed.length +
    checklistDiff.added.length +
    checklistDiff.removed.length +
    styleDiff.length;

  return (
    <div className="space-y-4">
      {/* Version Selector */}
      <Card>
        <CardContent className="flex items-center gap-4 py-3">
          <div className="flex items-center gap-2">
            <span className="text-xs text-zinc-500">From:</span>
            <select
              value={leftIdx}
              onChange={(e) => setLeftIdx(Number(e.target.value))}
              className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs text-zinc-300"
            >
              {policyVersions.map((p, i) => (
                <option key={p.id} value={i}>
                  v{p.version}
                </option>
              ))}
            </select>
          </div>
          <span className="text-zinc-600">→</span>
          <div className="flex items-center gap-2">
            <span className="text-xs text-zinc-500">To:</span>
            <select
              value={rightIdx}
              onChange={(e) => setRightIdx(Number(e.target.value))}
              className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs text-zinc-300"
            >
              {policyVersions.map((p, i) => (
                <option key={p.id} value={i}>
                  v{p.version}
                </option>
              ))}
            </select>
          </div>
          <Badge variant="secondary" className="ml-auto">
            {totalChanges} change{totalChanges !== 1 ? "s" : ""}
          </Badge>
        </CardContent>
      </Card>

      {/* Rules Diff */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Rules</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1">
          {rulesDiff.unchanged.map((r, i) => (
            <DiffLine key={`u-${i}`} type="unchanged">
              {r}
            </DiffLine>
          ))}
          {rulesDiff.removed.map((r, i) => (
            <DiffLine key={`r-${i}`} type="removed">
              {r}
            </DiffLine>
          ))}
          {rulesDiff.added.map((r, i) => (
            <DiffLine key={`a-${i}`} type="added">
              {r}
            </DiffLine>
          ))}
          {rulesDiff.unchanged.length === 0 &&
            rulesDiff.added.length === 0 &&
            rulesDiff.removed.length === 0 && (
              <p className="text-xs text-zinc-500">No rules defined.</p>
            )}
        </CardContent>
      </Card>

      {/* Style Diff */}
      {styleDiff.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Style</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            {styleDiff.map((d) => (
              <div key={d.key} className="space-y-0.5">
                {d.type === "changed" && (
                  <>
                    <DiffLine type="removed">
                      {d.key}: {JSON.stringify(d.old)}
                    </DiffLine>
                    <DiffLine type="added">
                      {d.key}: {JSON.stringify(d.new)}
                    </DiffLine>
                  </>
                )}
                {d.type === "added" && (
                  <DiffLine type="added">
                    {d.key}: {JSON.stringify(d.new)}
                  </DiffLine>
                )}
                {d.type === "removed" && (
                  <DiffLine type="removed">
                    {d.key}: {JSON.stringify(d.old)}
                  </DiffLine>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Checklist Diff */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Checklist</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1">
          {checklistDiff.unchanged.map((c, i) => (
            <DiffLine key={`u-${i}`} type="unchanged">
              {c}
            </DiffLine>
          ))}
          {checklistDiff.removed.map((c, i) => (
            <DiffLine key={`r-${i}`} type="removed">
              {c}
            </DiffLine>
          ))}
          {checklistDiff.added.map((c, i) => (
            <DiffLine key={`a-${i}`} type="added">
              {c}
            </DiffLine>
          ))}
          {checklistDiff.unchanged.length === 0 &&
            checklistDiff.added.length === 0 &&
            checklistDiff.removed.length === 0 && (
              <p className="text-xs text-zinc-500">No checklist items defined.</p>
            )}
        </CardContent>
      </Card>
    </div>
  );
}

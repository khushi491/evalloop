"use client";

import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

interface PolicyVersionData {
  id: string;
  version: number;
  policy: Record<string, unknown>;
  createdAt: string;
}

export function PolicyDiffView({
  policyVersions,
}: {
  policyVersions: PolicyVersionData[];
}) {
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

  // Placeholder — full diff in Task 8
  const first = policyVersions[0];
  const latest = policyVersions[policyVersions.length - 1];

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">
            Policy v{first.version} → v{latest.version}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-zinc-500">Full diff view coming next…</p>
        </CardContent>
      </Card>
    </div>
  );
}

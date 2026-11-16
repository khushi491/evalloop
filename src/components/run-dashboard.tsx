"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Plus, Zap } from "lucide-react";
import { DemoModeBanner } from "@/components/demo-mode-banner";
import { StartDemoButton } from "@/components/start-demo-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { listBrowserRuns } from "@/lib/browser-runs";
import type { RunSummary } from "@/lib/run-types";

function mergeRuns(server: RunSummary[], memory: boolean): RunSummary[] {
  if (!memory) return server;
  const local = listBrowserRuns();
  const localById = new Map(local.map((run) => [run.id, run]));
  const merged = server.map((run) => {
    const stored = localById.get(run.id);
    if (stored && stored.attemptCount > run.attemptCount) return stored;
    return run;
  });
  const seen = new Set(merged.map((run) => run.id));
  for (const run of local) {
    if (!seen.has(run.id)) merged.push(run);
  }
  return merged.sort((left, right) => (left.createdAt < right.createdAt ? 1 : -1));
}

export function RunDashboard() {
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [demoLabel, setDemoLabel] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/runs")
      .then((response) => response.json())
      .then((data) => {
        if (cancelled) return;
        setDemoLabel(typeof data.demoLabel === "string" ? data.demoLabel : null);
        setRuns(mergeRuns(data.runs ?? [], Boolean(data.memory)));
      })
      .catch(() => {
        if (!cancelled) setRuns(mergeRuns([], true));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Run the loop</h2>
          <p className="mt-1 text-sm text-zinc-400">
            The quick demo drafts a support reply, scores it, patches the policy, and reruns.
          </p>
        </div>
        <div className="flex gap-2">
          <StartDemoButton variant="outline">Quick Demo</StartDemoButton>
          <Link href="/runs/new">
            <Button>
              <Plus className="h-4 w-4" />
              New Run
            </Button>
          </Link>
        </div>
      </div>
      <DemoModeBanner label={demoLabel} />

      {loading ? (
        <div className="flex items-center justify-center py-16 text-zinc-500">Loading runs…</div>
      ) : runs.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Zap className="mb-4 h-10 w-10 text-zinc-600" />
            <p className="mb-2 text-lg font-medium text-zinc-300">No runs yet</p>
            <p className="mb-6 max-w-md text-center text-sm text-zinc-500">
              Start the double-charge preset, or write a task of your own. Scores from this loop are the in-app
              judge. The measured evaluation is the table above.
            </p>
            <div className="flex gap-3">
              <StartDemoButton variant="outline">Try Demo Preset</StartDemoButton>
              <Link href="/runs/new">
                <Button>
                  <Plus className="h-4 w-4" />
                  New Run
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {runs.map((run) => (
            <Link key={run.id} href={`/runs/${run.id}`}>
              <Card className="cursor-pointer transition-colors hover:border-zinc-600">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <div>
                    <CardTitle className="text-base">{run.title}</CardTitle>
                    <CardDescription>
                      {new Date(run.createdAt).toLocaleDateString()} · {run.attemptCount} attempt
                      {run.attemptCount === 1 ? "" : "s"}
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    {run.bestScore !== null && (
                      <Badge
                        variant={
                          run.bestScore >= 90 ? "success" : run.bestScore >= 70 ? "warning" : "destructive"
                        }
                      >
                        Score: {run.bestScore}
                      </Badge>
                    )}
                    <Badge variant="outline">{run.status}</Badge>
                  </div>
                </CardHeader>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

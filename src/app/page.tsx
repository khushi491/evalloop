"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, Zap } from "lucide-react";

interface RunSummary {
  id: string;
  title: string;
  createdAt: string;
  bestScore: number | null;
  attemptCount: number;
  status: string;
}

export default function Dashboard() {
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/runs")
      .then((r) => r.json())
      .then((data) => setRuns(data.runs ?? []))
      .catch(() => setRuns([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">EvalLoop</h1>
          <p className="mt-1 text-sm text-zinc-400">
            Self-improving agent — run, evaluate, patch, repeat.
          </p>
        </div>
        <Link href="/runs/new">
          <Button>
            <Plus className="h-4 w-4" />
            New Run
          </Button>
        </Link>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20 text-zinc-500">Loading runs…</div>
      ) : runs.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Zap className="mb-4 h-10 w-10 text-zinc-600" />
            <p className="mb-2 text-lg font-medium text-zinc-300">No runs yet</p>
            <p className="mb-6 text-sm text-zinc-500">Create your first self-improving run to get started.</p>
            <Link href="/runs/new">
              <Button>
                <Plus className="h-4 w-4" />
                New Run
              </Button>
            </Link>
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
                      {run.attemptCount !== 1 ? "s" : ""}
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    {run.bestScore !== null && (
                      <Badge variant={run.bestScore >= 90 ? "success" : run.bestScore >= 70 ? "warning" : "destructive"}>
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
    </main>
  );
}

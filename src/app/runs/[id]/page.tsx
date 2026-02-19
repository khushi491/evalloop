"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState, useCallback } from "react";
import { ArrowLeft, RotateCcw, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ScoreChart } from "@/components/score-chart";
import { CompareView } from "@/components/compare-view";
import { EvaluatorView } from "@/components/evaluator-view";
import { PolicyDiffView } from "@/components/policy-diff-view";

interface Attempt {
  id: string;
  index: number;
  outputText: string;
  createdAt: string;
  scoreTotal: number | null;
  scoreBreakdown: Record<string, number> | null;
  violations: { type: string; message: string; severity: string }[] | null;
}

interface PolicyVersionData {
  id: string;
  version: number;
  policy: Record<string, unknown>;
  createdAt: string;
}

interface RunDetail {
  id: string;
  title: string;
  taskText: string;
  maxAttempts: number;
  targetScore: number;
  status: string;
  createdAt: string;
  attempts: Attempt[];
  policyVersions: PolicyVersionData[];
}

export default function RunDetailPage() {
  const params = useParams();
  const router = useRouter();
  const runId = params.id as string;
  const [run, setRun] = useState<RunDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [executing, setExecuting] = useState(false);
  const [selectedAttempt, setSelectedAttempt] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);

  const fetchRun = useCallback(async () => {
    try {
      const res = await fetch(`/api/runs/${runId}`);
      if (!res.ok) throw new Error("Failed to load run");
      const data = await res.json();
      setRun(data);
      if (data.attempts?.length > 0) {
        setSelectedAttempt(data.attempts.length - 1);
      }
    } catch {
      setError("Failed to load run");
    } finally {
      setLoading(false);
    }
  }, [runId]);

  useEffect(() => {
    fetchRun();
  }, [fetchRun]);

  async function handleExecute() {
    setExecuting(true);
    setError(null);
    try {
      const res = await fetch(`/api/runs/${runId}/execute`, {
        method: "POST",
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Execution failed");
      }
      await fetchRun();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Execution failed");
    } finally {
      setExecuting(false);
    }
  }

  async function handleDelete() {
    if (!confirm("Delete this run and all its data?")) return;
    await fetch(`/api/runs/${runId}`, { method: "DELETE" });
    router.push("/");
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-zinc-400" />
      </main>
    );
  }

  if (!run) {
    return (
      <main className="mx-auto max-w-6xl px-6 py-10">
        <p className="text-zinc-400">Run not found.</p>
      </main>
    );
  }

  const bestAttempt = run.attempts.reduce<Attempt | null>((best, a) => {
    if (a.scoreTotal === null) return best;
    if (!best || (best.scoreTotal ?? 0) < a.scoreTotal) return a;
    return best;
  }, null);

  const firstAttempt = run.attempts[0] ?? null;
  const currentAttempt = run.attempts[selectedAttempt] ?? null;

  return (
    <main className="mx-auto max-w-7xl px-6 py-10">
      <div className="mb-6 flex items-center justify-between">
        <Link
          href="/"
          className="inline-flex items-center gap-1 text-sm text-zinc-400 hover:text-zinc-200"
        >
          <ArrowLeft className="h-4 w-4" />
          Dashboard
        </Link>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleDelete}
          >
            <Trash2 className="h-4 w-4" />
            Delete
          </Button>
          <Button
            size="sm"
            onClick={handleExecute}
            disabled={executing || run.status === "running"}
          >
            {executing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RotateCcw className="h-4 w-4" />
            )}
            {executing ? "Running…" : "Re-run"}
          </Button>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-800 bg-red-950 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      <div className="mb-6">
        <h1 className="text-2xl font-bold">{run.title}</h1>
        <p className="mt-1 text-sm text-zinc-400">
          {new Date(run.createdAt).toLocaleString()} ·{" "}
          {run.attempts.length} attempt{run.attempts.length !== 1 ? "s" : ""} ·
          Target: {run.targetScore}
        </p>
        <div className="mt-2 flex gap-2">
          <Badge
            variant={
              run.status === "completed"
                ? "success"
                : run.status === "running"
                ? "warning"
                : run.status === "failed"
                ? "destructive"
                : "outline"
            }
          >
            {run.status}
          </Badge>
          {bestAttempt && (
            <Badge
              variant={
                bestAttempt.scoreTotal! >= run.targetScore
                  ? "success"
                  : "secondary"
              }
            >
              Best: {bestAttempt.scoreTotal}
            </Badge>
          )}
        </div>
      </div>

      {run.attempts.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <p className="mb-2 text-lg font-medium text-zinc-300">
              No attempts yet
            </p>
            <p className="mb-6 text-sm text-zinc-500">
              Click &quot;Re-run&quot; to start the self-improving loop.
            </p>
            <Button onClick={handleExecute} disabled={executing}>
              {executing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RotateCcw className="h-4 w-4" />
              )}
              Execute
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-12 gap-6">
          {/* Left: Attempts Timeline */}
          <div className="col-span-3 space-y-2">
            <h3 className="mb-3 text-sm font-semibold text-zinc-400 uppercase tracking-wider">
              Attempts
            </h3>
            {run.attempts.map((a, idx) => (
              <button
                key={a.id}
                onClick={() => setSelectedAttempt(idx)}
                className={`w-full rounded-lg border p-3 text-left transition-colors ${
                  idx === selectedAttempt
                    ? "border-zinc-500 bg-zinc-800"
                    : "border-zinc-800 bg-zinc-900 hover:border-zinc-700"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">
                    Attempt {a.index}
                  </span>
                  {a.scoreTotal !== null && (
                    <Badge
                      variant={
                        a.scoreTotal >= run.targetScore
                          ? "success"
                          : a.scoreTotal >= 70
                          ? "warning"
                          : "destructive"
                      }
                      className="text-xs"
                    >
                      {a.scoreTotal}
                    </Badge>
                  )}
                </div>
              </button>
            ))}
          </div>

          {/* Center: Tabs */}
          <div className="col-span-6">
            <Tabs defaultValue="compare">
              <TabsList className="w-full">
                <TabsTrigger value="compare">Compare</TabsTrigger>
                <TabsTrigger value="evaluator">Evaluator</TabsTrigger>
                <TabsTrigger value="policy">Policy Diff</TabsTrigger>
                <TabsTrigger value="raw">Raw JSON</TabsTrigger>
              </TabsList>

              <TabsContent value="compare">
                <CompareView
                  first={firstAttempt}
                  best={bestAttempt}
                  current={currentAttempt}
                />
              </TabsContent>

              <TabsContent value="evaluator">
                {currentAttempt && (
                  <EvaluatorView attempt={currentAttempt} />
                )}
              </TabsContent>

              <TabsContent value="policy">
                <PolicyDiffView policyVersions={run.policyVersions} />
              </TabsContent>

              <TabsContent value="raw">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">
                      Raw Run Data
                    </CardTitle>
                    <CardDescription>
                      Full JSON for debugging
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <pre className="max-h-96 overflow-auto rounded-lg bg-zinc-950 p-4 text-xs text-zinc-300">
                      {JSON.stringify(run, null, 2)}
                    </pre>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>

          {/* Right: Score Chart */}
          <div className="col-span-3 space-y-4">
            <ScoreChart
              attempts={run.attempts}
              targetScore={run.targetScore}
            />
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Task</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="whitespace-pre-wrap text-xs text-zinc-400">
                  {run.taskText}
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </main>
  );
}

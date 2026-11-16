"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState, useCallback, useRef } from "react";
import { ArrowLeft, RotateCcw, Loader2, Trash2 } from "lucide-react";
import { DemoModeBanner } from "@/components/demo-mode-banner";
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
import { loadBrowserRun, preferRun, removeBrowserRun, saveBrowserRun } from "@/lib/browser-runs";
import type { RunAttempt, RunResponse } from "@/lib/run-types";

const autoJobs = new Map<string, Promise<void>>();

export default function RunDetailPage() {
  const params = useParams();
  const router = useRouter();
  const runId = params.id as string;
  const [run, setRun] = useState<RunResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [executing, setExecuting] = useState(false);
  const [selectedAttempt, setSelectedAttempt] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);

  const runRef = useRef(run);
  runRef.current = run;

  const applyRun = useCallback((data: RunResponse) => {
    setRun(data);
    if (data.memory) saveBrowserRun(data);
    setSelectedAttempt((current) => {
      if (data.attempts.length === 0) return 0;
      const last = data.attempts.length - 1;
      return current >= data.attempts.length ? last : current === 0 && data.attempts.length > 1 ? last : current;
    });
  }, []);

  const fetchRun = useCallback(async () => {
    try {
      const res = await fetch(`/api/runs/${runId}`);
      const server = res.ok ? ((await res.json()) as RunResponse) : null;
      const data = preferRun(server, loadBrowserRun(runId));
      if (!data) {
        setRun(null);
        setError("Failed to load run");
        return;
      }
      setError(null);
      applyRun(data);
    } catch {
      const local = loadBrowserRun(runId);
      if (local) {
        setError(null);
        applyRun(local);
      } else {
        setError("Failed to load run");
      }
    } finally {
      setLoading(false);
    }
  }, [applyRun, runId]);

  useEffect(() => {
    fetchRun();
  }, [fetchRun]);

  useEffect(() => {
    if (!run || run.status !== "running" || executing) return;
    const interval = setInterval(fetchRun, 2000);
    return () => clearInterval(interval);
  }, [run, executing, fetchRun]);

  const handleExecute = useCallback(async () => {
    setExecuting(true);
    setError(null);
    setRun((current) => (current ? { ...current, status: "running" } : current));
    const current = runRef.current;
    try {
      const res = await fetch(`/api/runs/${runId}/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          current
            ? {
                title: current.title,
                taskText: current.taskText,
                maxAttempts: current.maxAttempts,
                targetScore: current.targetScore,
                createdAt: current.createdAt,
              }
            : {}
        ),
      });
      const data = (await res.json()) as RunResponse & { error?: string };
      if (!res.ok) {
        throw new Error(data.error ?? "Execution failed");
      }
      setError(null);
      applyRun(data);
      setSelectedAttempt(Math.max(0, data.attempts.length - 1));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Execution failed");
      try {
        const res = await fetch(`/api/runs/${runId}`);
        if (res.ok) {
          applyRun((await res.json()) as RunResponse);
        }
      } catch {
        // Keep the execution error visible.
      }
    } finally {
      setExecuting(false);
    }
  }, [applyRun, runId]);

  useEffect(() => {
    if (!run?.memory) return;
    if (run.attempts.length > 0) return;
    if (run.status === "running" || run.status === "completed" || run.status === "failed") return;
    if (new URLSearchParams(window.location.search).get("auto") !== "1") return;
    const existing = autoJobs.get(run.id);
    if (existing) {
      void existing.then(() => fetchRun());
      return;
    }
    const job = handleExecute();
    autoJobs.set(run.id, job);
    void job.finally(() => {
      autoJobs.delete(run.id);
    });
  }, [run, handleExecute, fetchRun]);

  async function handleDelete() {
    if (!confirm("Delete this run and all its data?")) return;
    await fetch(`/api/runs/${runId}`, { method: "DELETE" });
    removeBrowserRun(runId);
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

  const bestAttempt = run.attempts.reduce<RunAttempt | null>((best, a) => {
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

      {run.status === "running" && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-amber-800 bg-amber-950/50 px-4 py-3 text-sm text-amber-300">
          <Loader2 className="h-4 w-4 animate-spin" />
          Self-improving loop is running... This page will auto-update.
        </div>
      )}

      {error && (
        <div className="mb-4 rounded-lg border border-red-800 bg-red-950 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      <div className="mb-6 space-y-4">
        <DemoModeBanner label={run.demoLabel} />
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
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          <div className="space-y-2 lg:col-span-3">
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
          <div className="lg:col-span-6">
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
          <div className="space-y-4 lg:col-span-3">
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

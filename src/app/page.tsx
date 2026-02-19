"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, Zap, Play, Loader2 } from "lucide-react";

const DEMO_PRESET = {
  title: "Double charge support reply",
  taskText: `Write a support reply to a customer who is angry that we charged them twice.
Constraints:
1) apologize once
2) do not admit fault
3) ask for order ID + last 4 digits of card
4) offer refund or credit options
5) max 90 words
6) tone: calm, confident, not robotic`,
};

interface RunSummary {
  id: string;
  title: string;
  createdAt: string;
  bestScore: number | null;
  attemptCount: number;
  status: string;
}

export default function Dashboard() {
  const router = useRouter();
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [demoRunning, setDemoRunning] = useState(false);

  useEffect(() => {
    fetch("/api/runs")
      .then((r) => r.json())
      .then((data) => setRuns(data.runs ?? []))
      .catch(() => setRuns([]))
      .finally(() => setLoading(false));
  }, []);

  async function handleQuickDemo() {
    setDemoRunning(true);
    try {
      const res = await fetch("/api/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: DEMO_PRESET.title,
          taskText: DEMO_PRESET.taskText,
          maxAttempts: 5,
          targetScore: 90,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      fetch(`/api/runs/${data.runId}/execute`, { method: "POST" });
      router.push(`/runs/${data.runId}`);
    } catch {
      alert("Failed to start demo");
      setDemoRunning(false);
    }
  }

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">EvalLoop</h1>
          <p className="mt-1 text-sm text-zinc-400">
            Self-improving agent — run, evaluate, patch, repeat.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={handleQuickDemo}
            disabled={demoRunning}
          >
            {demoRunning ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Play className="h-4 w-4" />
            )}
            Quick Demo
          </Button>
          <Link href="/runs/new">
            <Button>
              <Plus className="h-4 w-4" />
              New Run
            </Button>
          </Link>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20 text-zinc-500">
          Loading runs…
        </div>
      ) : runs.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Zap className="mb-4 h-10 w-10 text-zinc-600" />
            <p className="mb-2 text-lg font-medium text-zinc-300">
              No runs yet
            </p>
            <p className="mb-6 text-sm text-zinc-500">
              Create your first self-improving run to get started.
            </p>
            <div className="flex gap-3">
              <Button
                variant="outline"
                onClick={handleQuickDemo}
                disabled={demoRunning}
              >
                {demoRunning ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Play className="h-4 w-4" />
                )}
                Try Demo Preset
              </Button>
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
                      {new Date(run.createdAt).toLocaleDateString()} ·{" "}
                      {run.attemptCount} attempt
                      {run.attemptCount !== 1 ? "s" : ""}
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    {run.bestScore !== null && (
                      <Badge
                        variant={
                          run.bestScore >= 90
                            ? "success"
                            : run.bestScore >= 70
                            ? "warning"
                            : "destructive"
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
    </main>
  );
}

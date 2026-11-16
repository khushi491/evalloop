"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { saveBrowserRun } from "@/lib/browser-runs";
import type { RunResponse } from "@/lib/run-types";

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

export function StartDemoButton({
  variant = "default",
  children = "Quick Demo",
}: {
  variant?: "default" | "outline";
  children?: React.ReactNode;
}) {
  const router = useRouter();
  const [running, setRunning] = useState(false);

  async function start() {
    setRunning(true);
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
      const data = (await res.json()) as { error?: string; runId?: string; run?: RunResponse };
      if (!res.ok || !data.runId) throw new Error(data.error ?? "Failed to start demo");

      if (data.run?.memory) {
        saveBrowserRun(data.run);
        router.push(`/runs/${data.runId}?auto=1`);
        return;
      }

      fetch(`/api/runs/${data.runId}/execute`, { method: "POST" });
      router.push(`/runs/${data.runId}`);
    } catch {
      window.alert("Failed to start demo");
      setRunning(false);
    }
  }

  return (
    <Button variant={variant} onClick={start} disabled={running}>
      {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
      {children}
    </Button>
  );
}

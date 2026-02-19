"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { ArrowLeft, Play } from "lucide-react";
import Link from "next/link";

const PRESETS: Record<string, { title: string; taskText: string }> = {
  "": { title: "", taskText: "" },
  double_charge: {
    title: "Double charge support reply",
    taskText: `Write a support reply to a customer who is angry that we charged them twice.
Constraints:
1) apologize once
2) do not admit fault
3) ask for order ID + last 4 digits of card
4) offer refund or credit options
5) max 90 words
6) tone: calm, confident, not robotic`,
  },
  summarize: {
    title: "Summarize with constraints",
    taskText: `Summarize the following article in exactly 3 bullet points. Each bullet must be under 20 words. Do not use jargon. Maintain a neutral tone.

Article: [Paste article here]`,
  },
  policy_email: {
    title: "Policy-compliant email",
    taskText: `Draft an email to a vendor notifying them their contract will not be renewed.
Constraints:
1) professional tone
2) do not give specific reasons for non-renewal
3) offer to discuss in a call
4) max 100 words
5) include a sign-off with name placeholder`,
  },
};

export default function NewRunPage() {
  const router = useRouter();
  const [preset, setPreset] = useState("");
  const [title, setTitle] = useState("");
  const [taskText, setTaskText] = useState("");
  const [maxAttempts, setMaxAttempts] = useState(5);
  const [targetScore, setTargetScore] = useState(90);
  const [submitting, setSubmitting] = useState(false);

  function applyPreset(key: string) {
    setPreset(key);
    if (key && PRESETS[key]) {
      setTitle(PRESETS[key].title);
      setTaskText(PRESETS[key].taskText);
    }
  }

  async function handleSubmit(autoExecute: boolean) {
    if (!taskText.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title || "Untitled Run",
          taskText,
          maxAttempts,
          targetScore,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create run");

      if (autoExecute) {
        await fetch(`/api/runs/${data.runId}/execute`, { method: "POST" });
      }

      router.push(`/runs/${data.runId}`);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Error creating run");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="mx-auto max-w-2xl px-6 py-10">
      <Link href="/" className="mb-6 inline-flex items-center gap-1 text-sm text-zinc-400 hover:text-zinc-200">
        <ArrowLeft className="h-4 w-4" />
        Back to dashboard
      </Link>

      <Card>
        <CardHeader>
          <CardTitle className="text-xl">New Run</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <Label>Preset</Label>
            <Select value={preset} onChange={(e) => applyPreset(e.target.value)}>
              <option value="">— Select a preset —</option>
              <option value="double_charge">Double charge support reply</option>
              <option value="summarize">Summarize with constraints</option>
              <option value="policy_email">Policy-compliant email</option>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Title</Label>
            <Input
              placeholder="Run title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>Task Text</Label>
            <Textarea
              placeholder="Describe the task with constraints…"
              rows={8}
              value={taskText}
              onChange={(e) => setTaskText(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Max Attempts</Label>
              <Input
                type="number"
                min={1}
                max={20}
                value={maxAttempts}
                onChange={(e) => setMaxAttempts(Number(e.target.value))}
              />
            </div>
            <div className="space-y-2">
              <Label>Target Score</Label>
              <Input
                type="number"
                min={1}
                max={100}
                value={targetScore}
                onChange={(e) => setTargetScore(Number(e.target.value))}
              />
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <Button
              variant="outline"
              onClick={() => handleSubmit(false)}
              disabled={submitting || !taskText.trim()}
            >
              Create Run
            </Button>
            <Button
              onClick={() => handleSubmit(true)}
              disabled={submitting || !taskText.trim()}
            >
              <Play className="h-4 w-4" />
              {submitting ? "Running…" : "Create & Execute"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}

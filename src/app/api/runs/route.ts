import { NextRequest, NextResponse } from "next/server";
import { createProjectRun, listProjectRuns } from "@/lib/runs";
import { runModeFields } from "@/lib/demo-mode";

function asInt(value: unknown, fallback: number, min: number, max: number): number {
  const number = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  if (!Number.isInteger(number)) return fallback;
  if (number < min || number > max) return fallback;
  return number;
}

export async function GET() {
  try {
    const listed = await listProjectRuns();
    return NextResponse.json(listed);
  } catch (err) {
    console.error("[runs] list failed", err);
    return NextResponse.json(
      { ...runModeFields(), runs: [], error: "Failed to list runs" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { title, taskText, maxAttempts, targetScore } = body ?? {};

    if (!taskText || typeof taskText !== "string" || !taskText.trim()) {
      return NextResponse.json({ error: "taskText is required" }, { status: 400 });
    }

    const run = await createProjectRun({
      title: typeof title === "string" && title.trim() ? title.trim() : "Untitled Run",
      taskText: taskText.trim(),
      maxAttempts: asInt(maxAttempts, 5, 1, 20),
      targetScore: asInt(targetScore, 90, 1, 100),
    });

    return NextResponse.json({ runId: run.id, run, ...runModeFields() }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Failed to create run" }, { status: 500 });
  }
}

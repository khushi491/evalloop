import { NextResponse } from "next/server";
import { usesMemoryStore } from "@/lib/demo-mode";
import { executeRun } from "@/lib/execute";
import { rememberMemoryRun } from "@/lib/memory-store";

export const maxDuration = 60;

function asInt(value: unknown, fallback: number, min: number, max: number): number {
  const number = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  if (!Number.isInteger(number)) return fallback;
  if (number < min || number > max) return fallback;
  return number;
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ runId: string }> }
) {
  const { runId } = await params;

  try {
    if (usesMemoryStore()) {
      const text = await req.text();
      if (text.trim()) {
        try {
          const body = JSON.parse(text) as {
            title?: unknown;
            taskText?: unknown;
            maxAttempts?: unknown;
            targetScore?: unknown;
            createdAt?: unknown;
          };
          if (typeof body.taskText === "string" && body.taskText.trim()) {
            rememberMemoryRun(runId, {
              title: typeof body.title === "string" && body.title.trim() ? body.title.trim() : "Untitled Run",
              taskText: body.taskText,
              maxAttempts: asInt(body.maxAttempts, 5, 1, 20),
              targetScore: asInt(body.targetScore, 90, 1, 100),
              createdAt: typeof body.createdAt === "string" ? body.createdAt : undefined,
            });
          }
        } catch {
          // A non-JSON body still executes a run this instance already has.
        }
      }
    }

    const result = await executeRun(runId);
    return NextResponse.json(result);
  } catch (err) {
    console.error("[execute] Error for run", runId, err);
    const message = err instanceof Error ? err.message : "Execution failed";
    const status = /not found/i.test(message) ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

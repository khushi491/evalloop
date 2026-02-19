import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
  const runs = await prisma.projectRun.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      attempts: {
        select: { scoreTotal: true },
      },
    },
  });

  const mapped = runs.map((r) => {
    const scores = r.attempts
      .map((a) => a.scoreTotal)
      .filter((s): s is number => s !== null);
    return {
      id: r.id,
      title: r.title,
      createdAt: r.createdAt.toISOString(),
      status: r.status,
      attemptCount: r.attempts.length,
      bestScore: scores.length > 0 ? Math.max(...scores) : null,
    };
  });

  return NextResponse.json({ runs: mapped });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { title, taskText, maxAttempts, targetScore } = body;

    if (!taskText || typeof taskText !== "string" || !taskText.trim()) {
      return NextResponse.json({ error: "taskText is required" }, { status: 400 });
    }

    const run = await prisma.projectRun.create({
      data: {
        title: title || "Untitled Run",
        taskText: taskText.trim(),
        maxAttempts: maxAttempts ?? 5,
        targetScore: targetScore ?? 90,
      },
    });

    return NextResponse.json({ runId: run.id }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Failed to create run" }, { status: 500 });
  }
}

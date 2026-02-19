import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ runId: string }> }
) {
  const { runId } = await params;

  const run = await prisma.projectRun.findUnique({
    where: { id: runId },
    include: {
      attempts: { orderBy: { index: "asc" } },
      policyVersions: { orderBy: { version: "asc" } },
    },
  });

  if (!run) {
    return NextResponse.json({ error: "Run not found" }, { status: 404 });
  }

  return NextResponse.json({
    id: run.id,
    title: run.title,
    taskText: run.taskText,
    maxAttempts: run.maxAttempts,
    targetScore: run.targetScore,
    status: run.status,
    createdAt: run.createdAt.toISOString(),
    attempts: run.attempts.map((a) => ({
      id: a.id,
      index: a.index,
      outputText: a.outputText,
      createdAt: a.createdAt.toISOString(),
      scoreTotal: a.scoreTotal,
      scoreBreakdown: a.scoreBreakdownJson ? JSON.parse(a.scoreBreakdownJson) : null,
      violations: a.violationsJson ? JSON.parse(a.violationsJson) : null,
    })),
    policyVersions: run.policyVersions.map((p) => ({
      id: p.id,
      version: p.version,
      policy: JSON.parse(p.policyJson),
      createdAt: p.createdAt.toISOString(),
    })),
  });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ runId: string }> }
) {
  const { runId } = await params;

  try {
    await prisma.projectRun.delete({ where: { id: runId } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Failed to delete run" }, { status: 500 });
  }
}

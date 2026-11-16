import { NextResponse } from "next/server";
import { readProjectRun, removeProjectRun } from "@/lib/runs";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ runId: string }> }
) {
  const { runId } = await params;
  try {
    const run = await readProjectRun(runId);
    if (!run) {
      return NextResponse.json({ error: "Run not found" }, { status: 404 });
    }
    return NextResponse.json(run);
  } catch (err) {
    console.error("[runs] read failed", runId, err);
    return NextResponse.json({ error: "Failed to load run" }, { status: 500 });
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ runId: string }> }
) {
  const { runId } = await params;
  try {
    const removed = await removeProjectRun(runId);
    if (!removed) {
      return NextResponse.json({ error: "Run not found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Failed to delete run" }, { status: 500 });
  }
}

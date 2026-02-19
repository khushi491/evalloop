import { NextResponse } from "next/server";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ runId: string }> }
) {
  const { runId } = await params;
  // Placeholder — will be implemented in TASK 6
  return NextResponse.json({ error: "Execute not yet implemented", runId }, { status: 501 });
}

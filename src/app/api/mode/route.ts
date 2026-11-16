import { NextResponse } from "next/server";
import { runModeFields } from "@/lib/demo-mode";

export async function GET() {
  return NextResponse.json(runModeFields());
}

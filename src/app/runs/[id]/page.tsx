"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";

export default function RunDetailPage() {
  const params = useParams();
  const runId = params.id as string;

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <Link href="/" className="mb-6 inline-flex items-center gap-1 text-sm text-zinc-400 hover:text-zinc-200">
        <ArrowLeft className="h-4 w-4" />
        Back to dashboard
      </Link>
      <h1 className="text-2xl font-bold">Run: {runId}</h1>
      <p className="mt-2 text-zinc-400">Detail view coming soon…</p>
    </main>
  );
}

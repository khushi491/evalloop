import type { Metadata } from "next";
import { MeasuredResults } from "@/components/measured-results";
import { loadCommittedMeasuredResults } from "@/lib/measured-results";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "Measured results · EvalLoop",
  description: "Measured EvalLoop evaluation: training and held-out scores from the committed results file.",
};

export default function ResultsPage() {
  const measured = loadCommittedMeasuredResults();

  return (
    <main className="mx-auto max-w-6xl px-6 py-12">
      <p className="text-xs font-semibold tracking-[0.18em] text-emerald-300/90 uppercase">Measured evaluation</p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight">Results</h1>
      <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-400">
        These figures come from the committed {measured.model} run generated {measured.generatedAt}. Every number is
        formatted with the same report code that wrote {measured.sourceReport}. In-app runs that use a simulated model
        carry their own label and are not part of this page.
      </p>
      <div className="mt-8">
        <MeasuredResults view={measured} detailed />
      </div>
    </main>
  );
}

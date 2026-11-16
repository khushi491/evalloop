import Link from "next/link";
import { MeasuredResults } from "@/components/measured-results";
import { RunDashboard } from "@/components/run-dashboard";
import { StartDemoButton } from "@/components/start-demo-button";
import { loadCommittedMeasuredResults } from "@/lib/measured-results";

export const dynamic = "force-static";

const STEPS = [
  {
    n: "01",
    title: "Run the task",
    body: "The runner drafts an answer from the current policy: rules, tone, word cap, and checklist.",
  },
  {
    n: "02",
    title: "Evaluate",
    body: "An LLM judge scores five rubric categories from 0 to 5. Code hard checks enforce word limits, required text, forbidden text, JSON shape, and regex samples.",
  },
  {
    n: "03",
    title: "Patch the policy",
    body: "The patcher adds or removes rules from the judge findings. In the evaluation harness, hard-check failures are sent alongside that feedback.",
  },
  {
    n: "04",
    title: "Rerun",
    body: "The next attempt uses the updated policy. The product loop stops when the judge score hits the target or the attempt budget runs out.",
  },
];

export default function HomePage() {
  const measured = loadCommittedMeasuredResults();

  return (
    <main className="mx-auto max-w-6xl px-6 py-12">
      <section className="max-w-3xl">
        <p className="text-xs font-semibold tracking-[0.18em] text-emerald-300/90 uppercase">Self-improving agent</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight text-zinc-50 sm:text-5xl">EvalLoop</h1>
        <p className="mt-4 text-lg leading-8 text-zinc-300">
          EvalLoop runs a task, evaluates the draft with an LLM judge and with code hard checks, patches its policy,
          and runs again.
        </p>
        <p className="mt-4 text-sm leading-6 text-zinc-400">
          The in-app loop stores each attempt, the score breakdown, and the policy diff. A separate evaluation harness
          measures the same loop on training tasks and on held-out tasks the patcher never sees. Those measured
          numbers are on this page. A run you start here is labeled when the model is simulated.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <StartDemoButton>Run the demo</StartDemoButton>
          <Link
            href="/results"
            className="inline-flex h-9 items-center justify-center rounded-md border border-zinc-700 px-4 text-sm font-medium text-zinc-100 hover:bg-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400"
          >
            View measured results
          </Link>
        </div>
      </section>

      <section id="loop" className="scroll-mt-20 mt-16">
        <h2 className="text-xl font-semibold tracking-tight">How the loop works</h2>
        <ol className="mt-5 grid gap-3 sm:grid-cols-2">
          {STEPS.map((step) => (
            <li key={step.n} className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-5">
              <p className="font-mono text-xs text-emerald-300/80">{step.n}</p>
              <h3 className="mt-2 font-medium text-zinc-50">{step.title}</h3>
              <p className="mt-2 text-sm leading-6 text-zinc-400">{step.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section id="measured" className="scroll-mt-20 mt-16">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold tracking-tight">Measured results</h2>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-zinc-400">
              {measured.model}, generated {measured.generatedAt}. Training average total {measured.training.average.before.total}{" "}
              to {measured.training.average.after.total}. Held-out average total {measured.heldOut.average.initial.total} to{" "}
              {measured.heldOut.average.learned.total}.
            </p>
          </div>
        </div>
        <MeasuredResults view={measured} detailed={false} />
      </section>

      <section id="try" className="scroll-mt-20 mt-16 border-t border-zinc-800 pt-12">
        <RunDashboard />
      </section>
    </main>
  );
}

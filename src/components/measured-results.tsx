import Link from "next/link";
import type { MeasuredCell, MeasuredResultsView } from "@/lib/measured-results";

function Num({ value }: { value: string }) {
  return <td className="px-3 py-2 text-right font-mono text-zinc-100 tabular-nums">{value}</td>;
}

function cellsOf(cell: MeasuredCell) {
  return [cell.hardCheck, cell.judge, cell.total];
}

export function MeasuredResults({
  view,
  detailed,
}: {
  view: MeasuredResultsView;
  detailed: boolean;
}) {
  const trainingHead = [
    "Before hard-check",
    "Before judge",
    "Before total",
    "After hard-check",
    "After judge",
    "After total",
  ];
  const heldOutHead = [
    "Initial hard-check",
    "Initial judge",
    "Initial total",
    "Learned hard-check",
    "Learned judge",
    "Learned total",
  ];

  return (
    <div className="space-y-8">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-4">
          <p className="text-xs font-medium tracking-wide text-zinc-400 uppercase">Training average total</p>
          <p className="mt-3 flex items-baseline gap-3">
            <span className="font-mono text-2xl text-zinc-500 tabular-nums">{view.training.average.before.total}</span>
            <span className="text-zinc-600" aria-hidden>
              →
            </span>
            <span className="font-mono text-3xl font-semibold text-emerald-300 tabular-nums">
              {view.training.average.after.total}
            </span>
          </p>
          <p className="mt-2 text-xs text-zinc-500">
            Hard-check {view.training.average.before.hardCheck} → {view.training.average.after.hardCheck}. Judge{" "}
            {view.training.average.before.judge} → {view.training.average.after.judge}.
          </p>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-4">
          <p className="text-xs font-medium tracking-wide text-zinc-400 uppercase">Held-out average total</p>
          <p className="mt-3 flex items-baseline gap-3">
            <span className="font-mono text-2xl text-zinc-500 tabular-nums">{view.heldOut.average.initial.total}</span>
            <span className="text-zinc-600" aria-hidden>
              →
            </span>
            <span className="font-mono text-3xl font-semibold text-emerald-300 tabular-nums">
              {view.heldOut.average.learned.total}
            </span>
          </p>
          <p className="mt-2 text-xs text-zinc-500">
            Hard-check {view.heldOut.average.initial.hardCheck} → {view.heldOut.average.learned.hardCheck}. Judge{" "}
            {view.heldOut.average.initial.judge} → {view.heldOut.average.learned.judge}.
          </p>
        </div>
      </div>

      <dl className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["Model", view.model],
          ["Generated", view.generatedAt],
          ["Estimated cost", view.cost.estimated],
          ["Model calls", view.cost.modelCalls],
        ].map(([label, value]) => (
          <div key={label} className="rounded-lg border border-zinc-800 px-3 py-2">
            <dt className="text-zinc-500">{label}</dt>
            <dd className="font-medium text-zinc-100">{value}</dd>
          </div>
        ))}
      </dl>

      <p className="text-sm leading-6 text-zinc-400">
        Hard-check, judge, and total stay in separate columns. The total for an attempt is{" "}
        <code className="text-zinc-200">{view.totalFormula}</code>. Training before is the first scored attempt and
        training after is the last scored attempt. Held-out tasks are scored once under the initial policy and once
        under the learned policy. The patcher does not see held-out tasks.
      </p>

      {detailed ? (
        <>
          <div className="overflow-x-auto rounded-xl border border-zinc-800">
            <table className="w-full min-w-[480px] text-left text-sm">
              <caption className="border-b border-zinc-800 bg-zinc-900/80 px-3 py-2 text-left text-xs font-medium tracking-wide text-zinc-400 uppercase">
                Config
              </caption>
              <tbody>
                {[
                  ["Model", view.model],
                  ["Temperature", view.temperature],
                  ["Max attempts", view.maxAttempts],
                  ["Target total", view.targetScore],
                  ["Runs per task", view.runsPerTask],
                  ["Max cost", view.maxCost],
                  ["Max calls", view.maxCalls],
                  ["Delay between calls", view.delayMs],
                  ["Tasks", view.tasks],
                ].map(([label, value]) => (
                  <tr key={label} className="border-t border-zinc-800/80">
                    <th scope="row" className="w-48 px-3 py-2 align-top font-medium text-zinc-300">
                      {label}
                    </th>
                    <td className="px-3 py-2 text-zinc-100">{value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-sm leading-6 text-zinc-400">{view.priceNote}</p>
        </>
      ) : null}

      <div className="overflow-x-auto rounded-xl border border-zinc-800">
        <table className="w-full min-w-[880px] border-collapse text-left text-sm">
          <caption className="border-b border-zinc-800 bg-zinc-900/80 px-3 py-2 text-left text-xs font-medium tracking-wide text-zinc-400 uppercase">
            Training
          </caption>
          <thead className="text-xs text-zinc-400">
            <tr>
              <th scope="col" className="px-3 py-2 font-medium">Task</th>
              <th scope="col" className="px-3 py-2 font-medium">Runs</th>
              <th scope="col" className="px-3 py-2 font-medium">Attempts</th>
              {trainingHead.map((column) => (
                <th key={column} scope="col" className="px-3 py-2 text-right font-medium">
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {detailed
              ? view.training.rows.map((row) => (
                  <tr key={row.id} className="border-t border-zinc-800/80">
                    <th scope="row" className="px-3 py-2 font-medium text-zinc-100">
                      {row.title} <span className="font-normal text-zinc-500">({row.id})</span>
                    </th>
                    <td className="px-3 py-2 text-zinc-300">{row.runs}</td>
                    <td className="px-3 py-2 text-zinc-300">{row.attempts}</td>
                    {[...cellsOf(row.before), ...cellsOf(row.after)].map((value, index) => (
                      <Num key={`${row.id}-${index}`} value={value} />
                    ))}
                  </tr>
                ))
              : null}
            <tr className="border-t border-zinc-700 font-semibold">
              <th scope="row" className="px-3 py-2 text-zinc-50">
                Average
              </th>
              <td className="px-3 py-2" />
              <td className="px-3 py-2" />
              {[...cellsOf(view.training.average.before), ...cellsOf(view.training.average.after)].map(
                (value, index) => (
                  <Num key={`train-avg-${index}`} value={value} />
                )
              )}
            </tr>
          </tbody>
        </table>
      </div>

      <p className="text-sm leading-6 text-zinc-300">{view.policySummary}</p>
      <p className="text-sm leading-6 text-zinc-500">
        The learned policy keeps an initial rule unless every training run removed it, and it appends rules any
        training run added. The word cap is the minimum cap seen in training.
      </p>

      <div className="overflow-x-auto rounded-xl border border-zinc-800">
        <table className="w-full min-w-[880px] border-collapse text-left text-sm">
          <caption className="border-b border-zinc-800 bg-zinc-900/80 px-3 py-2 text-left text-xs font-medium tracking-wide text-zinc-400 uppercase">
            Held-out
          </caption>
          <thead className="text-xs text-zinc-400">
            <tr>
              <th scope="col" className="px-3 py-2 font-medium">Task</th>
              <th scope="col" className="px-3 py-2 font-medium">Runs</th>
              {heldOutHead.map((column) => (
                <th key={column} scope="col" className="px-3 py-2 text-right font-medium">
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {detailed
              ? view.heldOut.rows.map((row) => (
                  <tr key={row.id} className="border-t border-zinc-800/80">
                    <th scope="row" className="px-3 py-2 font-medium text-zinc-100">
                      {row.title} <span className="font-normal text-zinc-500">({row.id})</span>
                    </th>
                    <td className="px-3 py-2 text-zinc-300">{row.runs}</td>
                    {[...cellsOf(row.initial), ...cellsOf(row.learned)].map((value, index) => (
                      <Num key={`${row.id}-${index}`} value={value} />
                    ))}
                  </tr>
                ))
              : null}
            <tr className="border-t border-zinc-700 font-semibold">
              <th scope="row" className="px-3 py-2 text-zinc-50">
                Average
              </th>
              <td className="px-3 py-2" />
              {[...cellsOf(view.heldOut.average.initial), ...cellsOf(view.heldOut.average.learned)].map(
                (value, index) => (
                  <Num key={`held-avg-${index}`} value={value} />
                )
              )}
            </tr>
          </tbody>
        </table>
      </div>

      {detailed ? (
        <div className="overflow-x-auto rounded-xl border border-zinc-800">
          <table className="w-full text-left text-sm">
            <caption className="border-b border-zinc-800 bg-zinc-900/80 px-3 py-2 text-left text-xs font-medium tracking-wide text-zinc-400 uppercase">
              Cost
            </caption>
            <tbody>
              {[
                ["Estimated cost", view.cost.estimated],
                ["Prompt tokens", view.cost.promptTokens],
                ["Cached prompt tokens", view.cost.cachedPromptTokens],
                ["Completion tokens", view.cost.completionTokens],
                ["Model calls", view.cost.modelCalls],
                ["Calls missing usage", view.cost.callsMissingUsage],
              ].map(([label, value]) => (
                <tr key={label} className="border-t border-zinc-800/80">
                  <th scope="row" className="px-3 py-2 font-medium text-zinc-300">
                    {label}
                  </th>
                  <td className="px-3 py-2 font-mono text-zinc-100">{value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-sm">
          <Link
            href="/results"
            className="text-zinc-100 underline decoration-zinc-600 underline-offset-4 hover:decoration-zinc-300"
          >
            Full task tables, policy diff, and cost
          </Link>
        </p>
      )}

      <p className="text-xs leading-5 text-zinc-500">
        Measured evaluation read at build time from <span className="text-zinc-400">{view.sourceJson}</span> and{" "}
        <span className="text-zinc-400">{view.sourceReport}</span>. Temperature {view.temperature}.
      </p>
    </div>
  );
}

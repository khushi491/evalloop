import { summarizeEval, type ScoreCells } from "./aggregate";
import type { EvalResults } from "./types";

export function formatUsd(amount: number): string {
  if (!Number.isFinite(amount)) return "n/a";
  const rounded = Math.round(amount * 1_000_000) / 1_000_000;
  const negative = rounded < 0;
  const absolute = Math.abs(rounded);
  const [whole, fraction = ""] = absolute
    .toFixed(6)
    .replace(/0+$/, "")
    .replace(/\.$/, "")
    .split(".");
  return `${negative ? "-" : ""}$${whole}.${fraction.padEnd(2, "0")}`;
}

function formatPercent(rate: number): string {
  return `${(rate * 100).toFixed(1)}%`;
}

function formatScore(score: number): string {
  return score.toFixed(1);
}

function formatAttempts(count: number): string {
  return Number.isInteger(count) ? String(count) : count.toFixed(1);
}

function formatCells(cells: ScoreCells | null): [string, string, string] {
  if (!cells) return ["n/a", "n/a", "n/a"];
  return [formatPercent(cells.hardPassRate), formatScore(cells.judgeScore), formatScore(cells.total)];
}

function temperatureLine(results: EvalResults): string {
  const temperature = results.config.temperature;
  return `runner ${temperature.runner}, evaluator ${temperature.evaluator}, patcher ${temperature.patcher}`;
}

function maxCallsLabel(results: EvalResults): string {
  const value = results.config.maxCalls;
  if (value === null || value === undefined) return "none";
  return String(value);
}

function priceSentence(results: EvalResults): string {
  const price = results.config.price;
  if (price.known === false) {
    return `Price table: ${price.model}. No token price is configured for ${results.config.model}, so estimated cost is $0. ${price.note}`;
  }
  return `Price table for ${price.model}, checked ${price.checkedOn} (${price.source}): input ${formatUsd(price.inputUsdPerMillion)} per 1M tokens, cached input ${formatUsd(price.cachedInputUsdPerMillion)} per 1M tokens, output ${formatUsd(price.outputUsdPerMillion)} per 1M tokens. ${price.note}`;
}

function errorLines(prefix: string, id: string, errors: string[]): string[] {
  return errors.map((error) => `- ${prefix}\`${id}\`: ${error}`);
}

export function renderResultsMarkdown(results: EvalResults): string {
  const summary = summarizeEval(results);
  const lines: string[] = ["# EvalLoop results", ""];

  if (results.dryRun) {
    lines.push(
      "This file was generated from a dry run. The model calls were simulated. The scores are not a real evaluation.",
      ""
    );
  }
  if (results.aborted && results.abortReason) {
    lines.push(`The run aborted before it finished. ${results.abortReason}`, "");
  }
  if (results.resumedFrom) {
    lines.push(
      `Resumed from \`${results.resumedFrom}\`. Call costs recorded on earlier attempts are kept.`,
      ""
    );
  }

  lines.push(
    `Generated: ${results.generatedAt}`,
    "",
    "## Config",
    "",
    "| Setting | Value |",
    "| --- | --- |",
    `| Model | ${results.config.model} |`,
    `| Temperature | ${temperatureLine(results)} |`,
    `| Max attempts | ${results.config.maxAttempts} |`,
    `| Target total | ${results.config.targetScore} |`,
    `| Runs per task | ${results.config.runs} |`,
    `| Max cost | ${formatUsd(results.config.maxCostUsd)} |`,
    `| Max calls | ${maxCallsLabel(results)} |`,
    `| Delay between calls | ${results.config.delayMs ?? 0} ms |`,
    `| Tasks | ${results.config.taskIds.join(", ")} |`,
    "",
    priceSentence(results),
    "",
    `Total for an attempt is \`${results.config.totalFormula}\`. The judge score is the rubric total from the five 0–5 categories and is reported on its own. The hard-check rate is the share of deterministic checks that passed and is also reported on its own. The total blends those two, so a perfect judge score cannot hide a failed check. The loop stops when the total reaches the target and every hard check passes. Hard-check failures are sent to the patcher with the judge feedback.`,
    "",
    "When a task is repeated, each cell is the mean across runs that have a judge score. The average row is the unweighted mean across those tasks, and its total is recomputed from that mean hard-check rate and mean judge score.",
    "",
    "## Training",
    "",
    "Each training task starts from the initial policy. Before is the first scored attempt. After is the last scored attempt.",
    ""
  );

  if (summary.training.tasks.length === 0) {
    lines.push("No training tasks were included.", "");
  } else {
    lines.push(
      "| Task | Runs | Attempts | Before hard-check | Before judge | Before total | After hard-check | After judge | After total |",
      "| --- | --- | --- | --- | --- | --- | --- | --- | --- |"
    );
    for (const task of summary.training.tasks) {
      const before = formatCells(task.before);
      const after = formatCells(task.after);
      lines.push(
        `| ${task.title} (\`${task.id}\`) | ${task.runCount} | ${
          task.attemptCount === null ? "n/a" : formatAttempts(task.attemptCount)
        } | ${before.join(" | ")} | ${after.join(" | ")} |`
      );
    }
    const before = formatCells(summary.training.average.before);
    const after = formatCells(summary.training.average.after);
    lines.push(
      `| **Average** | | | ${before.join(" | ")} | ${after.join(" | ")} |`,
      ""
    );
    const errors = summary.training.tasks.flatMap((task) =>
      errorLines("", task.id, task.errors)
    );
    if (errors.length > 0) {
      lines.push("Errors:", "", ...errors, "");
    }
  }

  lines.push(
    "## Learned policy",
    "",
    `Compared with the initial policy: ${summary.policy.rulesAdded} rules added, ${summary.policy.rulesRemoved} rules removed, ${summary.policy.checklistAdded} checklist items added, ${summary.policy.checklistRemoved} checklist items removed. Word cap ${summary.policy.maxWordsFrom} → ${summary.policy.maxWordsTo}. Tone ${summary.policy.toneChanged ? "changed" : "unchanged"}.`,
    "",
    "The learned policy keeps an initial rule unless every training run removed it, and it appends rules any training run added. The word cap is the minimum cap seen in training.",
    "",
    "## Held-out",
    ""
  );

  if (results.heldOutSkippedReason) {
    lines.push(results.heldOutSkippedReason, "");
  } else if (summary.heldOut.tasks.length === 0) {
    lines.push("No held-out tasks were included.", "");
  } else {
    lines.push(
      "These tasks are scored once under the initial policy and once under the learned policy. The patcher does not see held-out tasks.",
      "",
      "| Task | Runs | Initial hard-check | Initial judge | Initial total | Learned hard-check | Learned judge | Learned total |",
      "| --- | --- | --- | --- | --- | --- | --- | --- |"
    );
    for (const task of summary.heldOut.tasks) {
      const initial = formatCells(task.initial);
      const learned = formatCells(task.learned);
      lines.push(
        `| ${task.title} (\`${task.id}\`) | ${task.runCount} | ${initial.join(" | ")} | ${learned.join(" | ")} |`
      );
    }
    const initial = formatCells(summary.heldOut.average.initial);
    const learned = formatCells(summary.heldOut.average.learned);
    lines.push(`| **Average** | | ${initial.join(" | ")} | ${learned.join(" | ")} |`, "");
    const errors = summary.heldOut.tasks.flatMap((task) => errorLines("", task.id, task.errors));
    if (errors.length > 0) {
      lines.push("Errors:", "", ...errors, "");
    }
  }

  lines.push(
    "## Cost",
    "",
    "| | |",
    "| --- | --- |",
    `| Estimated cost | ${formatUsd(results.totals.estimatedCostUsd)} |`,
    `| Prompt tokens | ${results.totals.promptTokens} |`,
    `| Cached prompt tokens | ${results.totals.cachedPromptTokens} |`,
    `| Completion tokens | ${results.totals.completionTokens} |`,
    `| Model calls | ${results.totals.modelCalls} |`,
    `| Calls missing usage | ${results.totals.callsMissingUsage} |`,
    ""
  );

  return `${lines.join("\n").replace(/\n{3,}/g, "\n\n").trim()}\n`;
}

export function assertResultsFile(value: unknown): EvalResults {
  if (!value || typeof value !== "object") {
    throw new Error("Results file must be a JSON object");
  }
  const record = value as Partial<EvalResults>;
  if (record.version !== 1) throw new Error("Unsupported results version");
  if (!record.config || !record.totals) {
    throw new Error("Results file is missing config or totals");
  }
  if (!Array.isArray(record.training) || !Array.isArray(record.heldOut)) {
    throw new Error("Results file is missing training or held-out arrays");
  }
  if (!record.initialPolicy || !record.learnedPolicy) {
    throw new Error("Results file is missing policies");
  }
  return record as EvalResults;
}

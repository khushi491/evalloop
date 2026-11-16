import fs from "node:fs";
import path from "node:path";
import { summarizeEval, type ScoreCells } from "./eval/aggregate";
import {
  assertResultsFile,
  describeMaxCalls,
  describeResultPrice,
  describeTemperatures,
  formatReportedAttempts,
  formatReportedCells,
  formatUsd,
} from "./eval/report";
import type { EvalResults } from "./eval/types";

export const MEASURED_RESULTS_JSON = "evals/results/2026-11-14T09-15-50-116Z.json";
export const MEASURED_RESULTS_REPORT = "evals/RESULTS.md";

export interface MeasuredCell {
  hardCheck: string;
  judge: string;
  total: string;
}

export interface MeasuredTrainingRow {
  id: string;
  title: string;
  runs: string;
  attempts: string;
  before: MeasuredCell;
  after: MeasuredCell;
}

export interface MeasuredHeldOutRow {
  id: string;
  title: string;
  runs: string;
  initial: MeasuredCell;
  learned: MeasuredCell;
}

export interface MeasuredResultsView {
  sourceJson: string;
  sourceReport: string;
  generatedAt: string;
  model: string;
  temperature: string;
  maxAttempts: string;
  targetScore: string;
  runsPerTask: string;
  maxCost: string;
  maxCalls: string;
  delayMs: string;
  tasks: string;
  totalFormula: string;
  priceNote: string;
  training: {
    rows: MeasuredTrainingRow[];
    average: { before: MeasuredCell; after: MeasuredCell };
  };
  heldOut: {
    rows: MeasuredHeldOutRow[];
    average: { initial: MeasuredCell; learned: MeasuredCell };
  };
  policySummary: string;
  cost: {
    estimated: string;
    promptTokens: string;
    cachedPromptTokens: string;
    completionTokens: string;
    modelCalls: string;
    callsMissingUsage: string;
  };
  dryRun: false;
}

function cellsOf(value: ScoreCells | null): MeasuredCell {
  const [hardCheck, judge, total] = formatReportedCells(value);
  return { hardCheck, judge, total };
}

export function measuredViewFromResults(results: EvalResults): MeasuredResultsView {
  if (results.dryRun) {
    throw new Error("Dry-run results cannot be presented as measured results");
  }
  const summary = summarizeEval(results);
  const policy = summary.policy;
  return {
    sourceJson: MEASURED_RESULTS_JSON,
    sourceReport: MEASURED_RESULTS_REPORT,
    generatedAt: results.generatedAt,
    model: results.config.model,
    temperature: describeTemperatures(results),
    maxAttempts: String(results.config.maxAttempts),
    targetScore: String(results.config.targetScore),
    runsPerTask: String(results.config.runs),
    maxCost: formatUsd(results.config.maxCostUsd),
    maxCalls: describeMaxCalls(results),
    delayMs: `${results.config.delayMs ?? 0} ms`,
    tasks: results.config.taskIds.join(", "),
    totalFormula: results.config.totalFormula,
    priceNote: describeResultPrice(results),
    training: {
      rows: summary.training.tasks.map((task) => ({
        id: task.id,
        title: task.title,
        runs: String(task.runCount),
        attempts: task.attemptCount === null ? "n/a" : formatReportedAttempts(task.attemptCount),
        before: cellsOf(task.before),
        after: cellsOf(task.after),
      })),
      average: {
        before: cellsOf(summary.training.average.before),
        after: cellsOf(summary.training.average.after),
      },
    },
    heldOut: {
      rows: summary.heldOut.tasks.map((task) => ({
        id: task.id,
        title: task.title,
        runs: String(task.runCount),
        initial: cellsOf(task.initial),
        learned: cellsOf(task.learned),
      })),
      average: {
        initial: cellsOf(summary.heldOut.average.initial),
        learned: cellsOf(summary.heldOut.average.learned),
      },
    },
    policySummary: `Compared with the initial policy: ${policy.rulesAdded} rules added, ${policy.rulesRemoved} rules removed, ${policy.checklistAdded} checklist items added, ${policy.checklistRemoved} checklist items removed. Word cap ${policy.maxWordsFrom} → ${policy.maxWordsTo}. Tone ${policy.toneChanged ? "changed" : "unchanged"}.`,
    cost: {
      estimated: formatUsd(results.totals.estimatedCostUsd),
      promptTokens: String(results.totals.promptTokens),
      cachedPromptTokens: String(results.totals.cachedPromptTokens),
      completionTokens: String(results.totals.completionTokens),
      modelCalls: String(results.totals.modelCalls),
      callsMissingUsage: String(results.totals.callsMissingUsage),
    },
    dryRun: false,
  };
}

export function loadCommittedMeasuredResults(
  cwd: string = process.cwd()
): MeasuredResultsView {
  const jsonPath = path.join(cwd, MEASURED_RESULTS_JSON);
  const results = assertResultsFile(JSON.parse(fs.readFileSync(jsonPath, "utf8")));
  return measuredViewFromResults(results);
}

import { appendFileSync, readFileSync, existsSync } from "node:fs";
import type { RoleClient } from "./client";
import {
  EVAL_METHODS,
  FEEDBACK_MODES,
  STOPPING_RULES,
  conditionsForMethod,
  type EvalMethod,
  type ExperimentCondition,
  type PatcherFeedback,
  type StoppingRule,
} from "./conditions";
import { upperBoundCalls } from "./estimate";
import type { EvalTask } from "./tasks";
import type { EvalResults } from "./types";
import { runSuite, suiteNeedsWork } from "./suite";

export interface SweepCell {
  method: EvalMethod;
  stopping: StoppingRule;
  feedback: PatcherFeedback;
  seed: number;
}

export interface SweepContext {
  provider: string;
  model: string;
  baseUrl: string;
  maxAttempts: number;
  target: number;
  runs: number;
  taskIds: string[];
  dryRun: boolean;
}

export interface SweepRecord {
  version: 1;
  key: string;
  cell: SweepCell;
  context: SweepContext;
  completed: boolean;
  results: EvalResults;
}

/**
 * One task from each category in each split. This is the minimal plan, not a
 * measured result.
 */
export const MINIMAL_TASK_IDS = [
  "support-double-charge",
  "release-json",
  "outage-summary",
  "email-regex",
  "status-update",
  "invoice-json",
  "interview-summary",
  "phone-regex",
] as const;

export function cellKey(cell: SweepCell, context: SweepContext): string {
  return [
    context.provider,
    context.model,
    context.baseUrl,
    context.dryRun ? "dry" : "live",
    cell.method,
    cell.stopping,
    cell.feedback,
    String(cell.seed),
    String(context.maxAttempts),
    String(context.target),
    String(context.runs),
    [...context.taskIds].sort().join(","),
  ].join("|");
}

export function sweepMatrix(options: {
  seeds: readonly number[];
  methods?: readonly EvalMethod[];
  stopping?: readonly StoppingRule[];
  feedback?: readonly PatcherFeedback[];
}): SweepCell[] {
  const methods = options.methods ?? [...EVAL_METHODS];
  const stopping = options.stopping ?? [...STOPPING_RULES];
  const feedback = options.feedback ?? [...FEEDBACK_MODES];
  const cells: SweepCell[] = [];
  for (const seed of options.seeds) {
    for (const method of methods) {
      const conditions: ExperimentCondition[] = conditionsForMethod(method, stopping, feedback);
      for (const condition of conditions) {
        cells.push({
          method: condition.method,
          stopping: condition.stopping,
          feedback: condition.feedback,
          seed,
        });
      }
    }
  }
  return cells;
}

/** The four cells compared on Gemini in the minimal plan. */
export function geminiMainCells(seeds: readonly number[]): SweepCell[] {
  return seeds.flatMap((seed) => [
    { method: "single-shot" as const, stopping: "judge-only" as const, feedback: "both" as const, seed },
    { method: "best-of-n" as const, stopping: "judge-only" as const, feedback: "both" as const, seed },
    {
      method: "self-refine" as const,
      stopping: "judge-and-hard" as const,
      feedback: "both" as const,
      seed,
    },
    { method: "policy" as const, stopping: "judge-and-hard" as const, feedback: "both" as const, seed },
  ]);
}

export function sameCell(left: SweepCell, right: SweepCell): boolean {
  return (
    left.method === right.method &&
    left.stopping === right.stopping &&
    left.feedback === right.feedback &&
    left.seed === right.seed
  );
}

/** Matrix cells that are not in the Gemini main comparison. */
export function localRemainderCells(seeds: readonly number[]): SweepCell[] {
  const main = geminiMainCells(seeds);
  return sweepMatrix({ seeds }).filter((cell) => !main.some((item) => sameCell(item, cell)));
}

export interface CallEstimate {
  cell: SweepCell;
  calls: number;
}

/** Upper bound: no early stop and no JSON parse retry. */
export function estimateCells(
  cells: readonly SweepCell[],
  tasks: readonly EvalTask[],
  maxAttempts: number,
  runs: number
): { rows: CallEstimate[]; total: number } {
  const trainingTasks = tasks.filter((task) => task.split === "train").length;
  const heldOutTasks = tasks.filter((task) => task.split === "heldout").length;
  const rows = cells.map((cell) => ({
    cell,
    calls: upperBoundCalls({
      method: cell.method,
      trainingTasks,
      heldOutTasks,
      runs,
      maxAttempts,
    }),
  }));
  return { rows, total: rows.reduce((sum, row) => sum + row.calls, 0) };
}

export function readSweepFile(file: string): SweepRecord[] {
  if (!existsSync(file)) return [];
  const text = readFileSync(file, "utf8");
  const records: SweepRecord[] = [];
  const lines = text.split(/\n/);
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]!.trim();
    if (!line) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new Error(`${file}:${index + 1}: ${detail}`);
    }
    if (!parsed || typeof parsed !== "object" || (parsed as SweepRecord).version !== 1) {
      throw new Error(`${file}:${index + 1}: unsupported sweep record`);
    }
    records.push(parsed as SweepRecord);
  }
  return records;
}

export function appendSweepRecord(file: string, record: SweepRecord): void {
  appendFileSync(file, `${JSON.stringify(record)}\n`);
}

function latestByKey(records: readonly SweepRecord[]): Map<string, SweepRecord> {
  const map = new Map<string, SweepRecord>();
  for (const record of records) map.set(record.key, record);
  return map;
}

export async function runSweep(options: {
  cells: readonly SweepCell[];
  tasks: readonly EvalTask[];
  context: SweepContext;
  maxCalls: number | null;
  maxCostUsd: number;
  delayMs: number;
  dryRun: boolean;
  prior: readonly SweepRecord[];
  client: RoleClient;
  sleep?: (ms: number) => Promise<void>;
  now?: () => Date;
  onRecord: (record: SweepRecord) => void;
  logger?: (line: string) => void;
}): Promise<{ appended: number; stoppedReason: string | null }> {
  const logger = options.logger ?? (() => {});
  const known = latestByKey(options.prior);
  let remaining = options.maxCalls;
  let appended = 0;
  for (const cell of options.cells) {
    const key = cellKey(cell, options.context);
    const previous = known.get(key);
    if (previous && !suiteNeedsWork(previous.results, options.tasks)) {
      logger(`[sweep] skip ${cell.method} ${cell.stopping} ${cell.feedback} seed ${cell.seed}`);
      continue;
    }
    if (remaining !== null && remaining <= 0) {
      return { appended, stoppedReason: "The sweep stopped because --max-calls was already used." };
    }
    logger(
      `[sweep] ${cell.method} ${cell.stopping} ${cell.feedback} seed ${cell.seed} ` +
        `provider ${options.context.provider}`
    );
    const results = await runSuite({
      tasks: options.tasks,
      runs: options.context.runs,
      maxAttempts: options.context.maxAttempts,
      targetScore: options.context.target,
      maxCostUsd: options.maxCostUsd,
      maxCalls: remaining,
      delayMs: options.delayMs,
      dryRun: options.dryRun,
      model: options.context.model,
      baseUrl: options.context.baseUrl,
      provider: options.context.provider,
      method: cell.method,
      stopping: cell.stopping,
      feedback: cell.feedback,
      seed: cell.seed,
      client: options.client,
      sleep: options.sleep,
      prior: previous?.results ?? null,
      resumedFrom: previous ? key : null,
      now: options.now ? options.now() : undefined,
      logger,
    });
    const previousCalls = previous?.results.totals.modelCalls ?? 0;
    const used = Math.max(0, results.totals.modelCalls - previousCalls);
    if (remaining !== null) remaining -= used;
    const record: SweepRecord = {
      version: 1,
      key,
      cell,
      context: options.context,
      completed: !suiteNeedsWork(results, options.tasks),
      results,
    };
    options.onRecord(record);
    known.set(key, record);
    appended += 1;
    if (results.aborted) {
      return { appended, stoppedReason: results.abortReason };
    }
  }
  return { appended, stoppedReason: null };
}

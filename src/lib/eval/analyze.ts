import type { EvalResults, TrainingRunRecord, AttemptRecord } from "./types";

export interface Interval {
  n: number;
  mean: number;
  low: number;
  high: number;
}

/** Deterministic generator in [0, 1). */
export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function percentile(sorted: readonly number[], p: number): number {
  if (sorted.length === 0) return Number.NaN;
  if (sorted.length === 1) return sorted[0]!;
  const rank = p * (sorted.length - 1);
  const low = Math.floor(rank);
  const high = Math.ceil(rank);
  if (low === high) return sorted[low]!;
  const weight = rank - low;
  return sorted[low]! * (1 - weight) + sorted[high]! * weight;
}

/**
 * Percentile bootstrap of the mean. An empty list returns null.
 * A single value has a degenerate interval (low = high = mean).
 */
export function bootstrapMean(
  values: readonly number[],
  options?: { seed?: number; samples?: number }
): Interval | null {
  if (values.length === 0) return null;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  if (values.length === 1) return { n: 1, mean, low: mean, high: mean };
  const samples = options?.samples ?? 1000;
  const random = mulberry32(options?.seed ?? 1);
  const means: number[] = [];
  for (let sample = 0; sample < samples; sample++) {
    let total = 0;
    for (let index = 0; index < values.length; index++) {
      const pick = Math.floor(random() * values.length);
      total += values[pick]!;
    }
    means.push(total / values.length);
  }
  means.sort((left, right) => left - right);
  return {
    n: values.length,
    mean,
    low: percentile(means, 0.025),
    high: percentile(means, 0.975),
  };
}

function scored(attempts: readonly AttemptRecord[]): AttemptRecord[] {
  return attempts.filter((attempt) => attempt.judge !== null);
}

function reportedAttempt(run: TrainingRunRecord): AttemptRecord | null {
  const attempts = scored(run.attempts);
  if (attempts.length === 0) return null;
  if (run.selectedAttempt != null) {
    return attempts.find((attempt) => attempt.index === run.selectedAttempt) ?? attempts[attempts.length - 1]!;
  }
  return attempts[attempts.length - 1]!;
}

export function judgeGap(attempt: AttemptRecord): number | null {
  if (!attempt.judge) return null;
  return attempt.judge.score - attempt.hardChecks.passRate * 100;
}

function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export interface MethodSummary {
  method: string;
  stopping: string;
  feedback: string;
  hardPass: Interval | null;
  judge: Interval | null;
  /** Tasks where the reported attempt did not gain hard-check percentage points. */
  tasksWithoutGain: number;
  tokensPerPoint: Interval | null;
  usdPerPoint: Interval | null;
}

export interface GapPoint {
  iteration: number;
  gap: Interval | null;
}

export interface TransferSummary {
  hardDelta: Interval | null;
  judgeDelta: Interval | null;
}

export interface Analysis {
  mock: boolean;
  /** True when every input file was a dry run. False when any live run is included. */
  sources: { files: number; dryRuns: number; liveRuns: number };
  methods: MethodSummary[];
  gapByIteration: { label: string; points: GapPoint[] }[];
  transfer: TransferSummary;
}

function conditionLabel(results: EvalResults): string {
  const method = results.config.method ?? "policy";
  const stopping = results.config.stopping ?? "judge-and-hard";
  const feedback = results.config.feedback ?? "both";
  return `${method} / ${stopping} / ${feedback}`;
}

function taskMeans(
  results: EvalResults,
  pick: (attempt: AttemptRecord) => number | null
): number[] {
  const values: number[] = [];
  for (const task of results.training) {
    const picked: number[] = [];
    for (const run of task.runs) {
      const attempt = reportedAttempt(run);
      if (!attempt) continue;
      const value = pick(attempt);
      if (value !== null) picked.push(value);
    }
    const averaged = mean(picked);
    if (averaged !== null) values.push(averaged);
  }
  return values;
}

function costRows(results: EvalResults): { tokens: number[]; usd: number[]; skipped: number } {
  const tokens: number[] = [];
  const usd: number[] = [];
  let skipped = 0;
  for (const task of results.training) {
    const tokenRates: number[] = [];
    const usdRates: number[] = [];
    for (const run of task.runs) {
      const attempts = scored(run.attempts);
      const reported = reportedAttempt(run);
      if (!reported || attempts.length === 0) continue;
      const before = attempts[0]!;
      const gained = (reported.hardChecks.passRate - before.hardChecks.passRate) * 100;
      const spentTokens = run.attempts.reduce(
        (sum, attempt) => sum + attempt.tokens.prompt + attempt.tokens.completion,
        0
      );
      const spentUsd = run.attempts.reduce((sum, attempt) => sum + attempt.costUsd, 0);
      if (gained <= 0) continue;
      tokenRates.push(spentTokens / gained);
      usdRates.push(spentUsd / gained);
    }
    if (tokenRates.length === 0) {
      skipped += 1;
      continue;
    }
    const tokenMean = mean(tokenRates);
    const usdMean = mean(usdRates);
    if (tokenMean !== null) tokens.push(tokenMean);
    if (usdMean !== null) usd.push(usdMean);
  }
  return { tokens, usd, skipped };
}

export function analyzeResults(
  files: readonly EvalResults[],
  options?: { seed?: number; samples?: number }
): Analysis {
  const boot = { seed: options?.seed ?? 1, samples: options?.samples ?? 1000 };
  const dryRuns = files.filter((file) => file.dryRun).length;
  const grouped = new Map<string, EvalResults[]>();
  for (const file of files) {
    const label = conditionLabel(file);
    const list = grouped.get(label) ?? [];
    list.push(file);
    grouped.set(label, list);
  }
  const methods: MethodSummary[] = [];
  const gapByIteration: Analysis["gapByIteration"] = [];
  for (const [label, group] of grouped) {
    const first = group[0]!;
    const hardValues = group.flatMap((file) =>
      taskMeans(file, (attempt) => attempt.hardChecks.passRate)
    );
    const judgeValues = group.flatMap((file) =>
      taskMeans(file, (attempt) => (attempt.judge ? attempt.judge.score : null))
    );
    const costs = group.map((file) => costRows(file));
    methods.push({
      method: first.config.method ?? "policy",
      stopping: first.config.stopping ?? "judge-and-hard",
      feedback: first.config.feedback ?? "both",
      hardPass: bootstrapMean(hardValues, boot),
      judge: bootstrapMean(judgeValues, boot),
      tasksWithoutGain: costs.reduce((sum, row) => sum + row.skipped, 0),
      tokensPerPoint: bootstrapMean(
        costs.flatMap((row) => row.tokens),
        boot
      ),
      usdPerPoint: bootstrapMean(
        costs.flatMap((row) => row.usd),
        boot
      ),
    });
    const methodName = first.config.method ?? "policy";
    if (methodName === "policy" || methodName === "self-refine") {
      const byIteration = new Map<number, number[]>();
      for (const file of group) {
        for (const task of file.training) {
          const gaps = new Map<number, number[]>();
          for (const run of task.runs) {
            for (const attempt of scored(run.attempts)) {
              const gap = judgeGap(attempt);
              if (gap === null) continue;
              const list = gaps.get(attempt.index) ?? [];
              list.push(gap);
              gaps.set(attempt.index, list);
            }
          }
          for (const [iteration, values] of gaps) {
            const averaged = mean(values);
            if (averaged === null) continue;
            const bucket = byIteration.get(iteration) ?? [];
            bucket.push(averaged);
            byIteration.set(iteration, bucket);
          }
        }
      }
      gapByIteration.push({
        label,
        points: [...byIteration.keys()]
          .sort((left, right) => left - right)
          .map((iteration) => ({
            iteration,
            gap: bootstrapMean(byIteration.get(iteration) ?? [], boot),
          })),
      });
    }
  }

  const hardDeltas: number[] = [];
  const judgeDeltas: number[] = [];
  for (const file of files) {
    if ((file.config.method ?? "policy") !== "policy") continue;
    for (const task of file.heldOut) {
      const hard: number[] = [];
      const judge: number[] = [];
      for (const run of task.runs) {
        if (run.transfer === "not-applicable") continue;
        const initial = run.initial.attempt;
        const learned = run.learned.attempt;
        if (!initial?.judge || !learned?.judge) continue;
        hard.push((learned.hardChecks.passRate - initial.hardChecks.passRate) * 100);
        judge.push(learned.judge.score - initial.judge.score);
      }
      const hardMean = mean(hard);
      const judgeMean = mean(judge);
      if (hardMean !== null) hardDeltas.push(hardMean);
      if (judgeMean !== null) judgeDeltas.push(judgeMean);
    }
  }

  return {
    mock: files.length === 0 || dryRuns > 0,
    sources: { files: files.length, dryRuns, liveRuns: files.length - dryRuns },
    methods,
    gapByIteration,
    transfer: {
      hardDelta: bootstrapMean(hardDeltas, boot),
      judgeDelta: bootstrapMean(judgeDeltas, boot),
    },
  };
}

export function formatInterval(interval: Interval | null): string {
  if (!interval) return "n/a";
  return `${interval.mean.toFixed(2)} [${interval.low.toFixed(2)}, ${interval.high.toFixed(2)}] (n=${interval.n})`;
}

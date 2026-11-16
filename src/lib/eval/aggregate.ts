import { policyDelta, type PolicyDelta } from "./merge";
import { compositeTotal } from "./metrics";
import type {
  AttemptRecord,
  EvalResults,
  HeldOutRunRecord,
  TrainingRunRecord,
} from "./types";

export interface ScoreCells {
  hardPassRate: number;
  judgeScore: number;
  total: number;
}

export interface TrainingComparison {
  id: string;
  title: string;
  runCount: number;
  /** Mean number of attempts across runs that produced a judge score. */
  attemptCount: number | null;
  before: ScoreCells | null;
  after: ScoreCells | null;
  errors: string[];
}

export interface HeldOutComparison {
  id: string;
  title: string;
  runCount: number;
  initial: ScoreCells | null;
  learned: ScoreCells | null;
  errors: string[];
}

export interface EvalSummary {
  training: {
    tasks: TrainingComparison[];
    average: { before: ScoreCells | null; after: ScoreCells | null };
  };
  heldOut: {
    tasks: HeldOutComparison[];
    average: { initial: ScoreCells | null; learned: ScoreCells | null };
  };
  policy: PolicyDelta;
}

function mean(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function cellsFrom(attempts: AttemptRecord[]): ScoreCells {
  const hardPassRate = mean(attempts.map((attempt) => attempt.hardChecks.passRate));
  const judgeScore = mean(attempts.map((attempt) => attempt.judge!.score));
  return {
    hardPassRate,
    judgeScore,
    total: compositeTotal(hardPassRate, judgeScore),
  };
}

function averageCells(cells: ScoreCells[]): ScoreCells | null {
  if (cells.length === 0) return null;
  const hardPassRate = mean(cells.map((cell) => cell.hardPassRate));
  const judgeScore = mean(cells.map((cell) => cell.judgeScore));
  return {
    hardPassRate,
    judgeScore,
    total: compositeTotal(hardPassRate, judgeScore),
  };
}

function scoredAttempts(attempts: AttemptRecord[]): AttemptRecord[] {
  return attempts.filter((attempt) => attempt.judge !== null);
}

function trainingErrors(run: TrainingRunRecord): string[] {
  const errors: string[] = [];
  if (run.error) errors.push(run.error);
  for (const attempt of run.attempts) {
    if (attempt.error && attempt.judge === null) errors.push(attempt.error);
  }
  return errors;
}

export function compareTraining(runs: TrainingRunRecord[]): Omit<
  TrainingComparison,
  "id" | "title" | "runCount"
> {
  const usable = runs.flatMap((run) => {
    const scored = scoredAttempts(run.attempts);
    if (scored.length === 0) return [];
    const selected =
      run.selectedAttempt == null
        ? scored[scored.length - 1]!
        : (scored.find((attempt) => attempt.index === run.selectedAttempt) ??
          scored[scored.length - 1]!);
    return [{ before: scored[0]!, after: selected, attempts: run.attempts.length }];
  });
  if (usable.length === 0) {
    return {
      attemptCount: null,
      before: null,
      after: null,
      errors: runs.flatMap(trainingErrors),
    };
  }
  return {
    attemptCount: mean(usable.map((item) => item.attempts)),
    before: cellsFrom(usable.map((item) => item.before)),
    after: cellsFrom(usable.map((item) => item.after)),
    errors: runs.flatMap(trainingErrors),
  };
}

function passErrors(run: HeldOutRunRecord): string[] {
  return [run.initial.error, run.learned.error].filter((error): error is string => Boolean(error));
}

export function compareHeldOut(runs: HeldOutRunRecord[]): Omit<
  HeldOutComparison,
  "id" | "title" | "runCount"
> {
  const initial = runs.flatMap((run) =>
    run.initial.attempt?.judge ? [run.initial.attempt] : []
  );
  const learned = runs.flatMap((run) =>
    run.learned.attempt?.judge ? [run.learned.attempt] : []
  );
  return {
    initial: initial.length > 0 ? cellsFrom(initial) : null,
    learned: learned.length > 0 ? cellsFrom(learned) : null,
    errors: runs.flatMap(passErrors),
  };
}

export function summarizeEval(results: EvalResults): EvalSummary {
  const trainingTasks: TrainingComparison[] = results.training.map((task) => ({
    id: task.id,
    title: task.title,
    runCount: task.runs.length,
    ...compareTraining(task.runs),
  }));
  const heldOutTasks: HeldOutComparison[] = results.heldOut.map((task) => ({
    id: task.id,
    title: task.title,
    runCount: task.runs.length,
    ...compareHeldOut(task.runs),
  }));
  return {
    training: {
      tasks: trainingTasks,
      average: {
        before: averageCells(
          trainingTasks.flatMap((task) => (task.before ? [task.before] : []))
        ),
        after: averageCells(
          trainingTasks.flatMap((task) => (task.after ? [task.after] : []))
        ),
      },
    },
    heldOut: {
      tasks: heldOutTasks,
      average: {
        initial: averageCells(
          heldOutTasks.flatMap((task) => (task.initial ? [task.initial] : []))
        ),
        learned: averageCells(
          heldOutTasks.flatMap((task) => (task.learned ? [task.learned] : []))
        ),
      },
    },
    policy: policyDelta(results.initialPolicy, results.learnedPolicy),
  };
}

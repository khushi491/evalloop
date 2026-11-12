import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRoleClient } from "../src/lib/eval/client";
import {
  FEEDBACK_MODES,
  EVAL_METHODS,
  STOPPING_RULES,
  parseChoice,
  type EvalMethod,
  type PatcherFeedback,
  type StoppingRule,
} from "../src/lib/eval/conditions";
import { describeBudget } from "../src/lib/eval/estimate";
import { resolveProvider } from "../src/lib/eval/provider";
import {
  MINIMAL_TASK_IDS,
  appendSweepRecord,
  estimateCells,
  geminiMainCells,
  localRemainderCells,
  readSweepFile,
  runSweep,
  sweepMatrix,
} from "../src/lib/eval/sweep";
import { loadTasks, selectTasks } from "../src/lib/eval/tasks";
import { loadEnvFile } from "./load-env";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const HELP = `EvalLoop sweep

Usage:
  pnpm sweep -- [options]

Options:
  --estimate           Print the call upper bound and exit. No model calls.
  --plan minimal|all   minimal uses one task per category per split (default: all).
  --compare all|gemini|local
                       all is the matrix (default). gemini is the four-cell main
                       comparison. local is the matrix with those four cells removed.
  --dry-run            Simulation client. No API key and no network.
  --seeds 1,2,3        Seeds (default: 1).
  --methods a,b        Subset of single-shot,best-of-n,self-refine,policy.
  --stopping a,b       Subset of judge-only,judge-and-hard.
  --feedback a,b       Subset of critique-only,hard-checks-only,both.
  --tasks id,id        Task ids. Default is the plan's tasks.
  --runs N             Runs per task (default: 1).
  --max-attempts N     Attempt cap that sets the shared per-task call budget (default: 2).
  --target N           Stopping threshold (default: 90).
  --max-calls N        Stop this invocation before the next call once N calls are made.
  --max-cost USD       Estimated spend cap for this invocation (default: 3).
  --delay-ms N         Wait between calls (default: 0).
  --out FILE           JSONL file. An existing file is resumed (default: evals/results/sweep.jsonl).
  --help

The file is append-only. A finished cell is skipped. An unfinished cell is resumed.
Provider, model, and base URL come from EVAL_PROVIDER, OPENAI_MODEL, and OPENAI_BASE_URL
and are stored on every line, so a Gemini file and an Ollama file can be the same --out.
The upper bound assumes no early stop and no JSON parse retry.
`;

interface SweepArgs {
  estimate: boolean;
  plan: "minimal" | "all";
  compare: "all" | "gemini" | "local";
  dryRun: boolean;
  seeds: number[];
  methods: EvalMethod[] | null;
  stopping: StoppingRule[] | null;
  feedback: PatcherFeedback[] | null;
  tasks: string[] | null;
  runs: number;
  maxAttempts: number;
  target: number;
  maxCalls: number | null;
  maxCost: number;
  delayMs: number;
  out: string;
  help: boolean;
}

function requireValue(flag: string, rest: string[]): string {
  const value = rest.shift();
  if (value === undefined || value.startsWith("--")) throw new Error(`${flag} requires a value`);
  return value;
}

function positiveInt(flag: string, raw: string): number {
  if (!/^[1-9]\d*$/.test(raw)) throw new Error(`${flag} must be a positive integer`);
  return Number(raw);
}

function nonNegativeInt(flag: string, raw: string): number {
  if (!/^\d+$/.test(raw)) throw new Error(`${flag} must be an integer greater than or equal to 0`);
  return Number(raw);
}

function nonNegative(flag: string, raw: string): number {
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${flag} must be a number greater than or equal to 0`);
  }
  return value;
}

function list(flag: string, raw: string): string[] {
  const values = raw.split(",").map((item) => item.trim()).filter((item) => item.length > 0);
  if (values.length === 0) throw new Error(`${flag} requires a value`);
  return values;
}

function parseArgs(argv: readonly string[]): SweepArgs {
  const args: SweepArgs = {
    estimate: false,
    plan: "all",
    compare: "all",
    dryRun: false,
    seeds: [1],
    methods: null,
    stopping: null,
    feedback: null,
    tasks: null,
    runs: 1,
    maxAttempts: 2,
    target: 90,
    maxCalls: null,
    maxCost: 3,
    delayMs: 0,
    out: "evals/results/sweep.jsonl",
    help: false,
  };
  const rest = [...argv];
  while (rest.length > 0) {
    const token = rest.shift()!;
    if (token === "--") continue;
    switch (token) {
      case "--help":
      case "-h":
        args.help = true;
        break;
      case "--estimate":
        args.estimate = true;
        break;
      case "--dry-run":
        args.dryRun = true;
        break;
      case "--plan": {
        const plan = requireValue(token, rest);
        if (plan !== "minimal" && plan !== "all") throw new Error("--plan must be minimal or all");
        args.plan = plan;
        break;
      }
      case "--compare": {
        const compare = requireValue(token, rest);
        if (compare !== "all" && compare !== "gemini" && compare !== "local") {
          throw new Error("--compare must be all, gemini, or local");
        }
        args.compare = compare;
        break;
      }
      case "--seeds":
        args.seeds = list(token, requireValue(token, rest)).map((item) => nonNegativeInt("--seeds", item));
        break;
      case "--methods":
        args.methods = list(token, requireValue(token, rest)).map((item) =>
          parseChoice("--methods", item, EVAL_METHODS)
        );
        break;
      case "--stopping":
        args.stopping = list(token, requireValue(token, rest)).map((item) =>
          parseChoice("--stopping", item, STOPPING_RULES)
        );
        break;
      case "--feedback":
        args.feedback = list(token, requireValue(token, rest)).map((item) =>
          parseChoice("--feedback", item, FEEDBACK_MODES)
        );
        break;
      case "--tasks":
        args.tasks = list(token, requireValue(token, rest));
        break;
      case "--runs":
        args.runs = positiveInt("--runs", requireValue(token, rest));
        break;
      case "--max-attempts":
        args.maxAttempts = positiveInt("--max-attempts", requireValue(token, rest));
        break;
      case "--target": {
        const value = Number(requireValue(token, rest));
        if (!Number.isFinite(value)) throw new Error("--target must be a finite number");
        args.target = value;
        break;
      }
      case "--max-calls":
        args.maxCalls = nonNegativeInt("--max-calls", requireValue(token, rest));
        break;
      case "--max-cost":
        args.maxCost = nonNegative("--max-cost", requireValue(token, rest));
        break;
      case "--delay-ms":
        args.delayMs = nonNegativeInt("--delay-ms", requireValue(token, rest));
        break;
      case "--out":
        args.out = requireValue(token, rest);
        break;
      default:
        throw new Error(`Unknown argument: ${token}`);
    }
  }
  return args;
}

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

function printEstimate(
  title: string,
  rows: { cell: { method: string; stopping: string; feedback: string; seed: number }; calls: number }[],
  total: number
) {
  console.log(title);
  for (const row of rows) {
    console.log(
      `  ${row.cell.method} ${row.cell.stopping} ${row.cell.feedback} seed ${row.cell.seed}: ${row.calls}`
    );
  }
  console.log(`  total upper bound: ${total}`);
}

async function main() {
  let args: SweepArgs;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  }
  if (args.help) {
    console.log(HELP);
    return;
  }

  loadEnvFile(path.join(repoRoot, ".env"));
  const provider = resolveProvider();
  const loaded = loadTasks();
  const planIds = args.plan === "minimal" ? [...MINIMAL_TASK_IDS] : null;
  const wanted = args.tasks ?? planIds;
  let tasks;
  try {
    tasks = selectTasks(loaded, wanted);
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  }

  const baseCells =
    args.compare === "gemini"
      ? geminiMainCells(args.seeds)
      : args.compare === "local"
        ? localRemainderCells(args.seeds)
        : sweepMatrix({
            seeds: args.seeds,
            methods: args.methods ?? undefined,
            stopping: args.stopping ?? undefined,
            feedback: args.feedback ?? undefined,
          });
  const cells = baseCells.filter(
    (cell) =>
      (args.methods === null || args.methods.includes(cell.method)) &&
      (args.stopping === null || args.stopping.includes(cell.stopping)) &&
      (args.feedback === null || args.feedback.includes(cell.feedback))
  );
  console.log(describeBudget(args.maxAttempts));
  console.log(
    `Provider ${provider.provider}, model ${provider.model}, base ${provider.baseUrl}, tasks ${tasks.length}, cells ${cells.length}`
  );

  if (args.estimate || args.plan === "minimal") {
    const estimate = estimateCells(cells, tasks, args.maxAttempts, args.runs);
    printEstimate("This invocation's matrix (upper bound)", estimate.rows, estimate.total);
  }
  if (
    args.estimate &&
    args.plan === "minimal" &&
    args.compare === "all" &&
    !args.methods &&
    !args.stopping &&
    !args.feedback
  ) {
    const gemini = estimateCells(geminiMainCells(args.seeds), tasks, args.maxAttempts, args.runs);
    const local = estimateCells(localRemainderCells(args.seeds), tasks, args.maxAttempts, args.runs);
    printEstimate("Minimal plan, Gemini main comparison (upper bound)", gemini.rows, gemini.total);
    printEstimate("Minimal plan, local model, remaining cells (upper bound)", local.rows, local.total);
  }
  if (args.estimate) return;

  if (!args.dryRun) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey || apiKey === "sk-placeholder") {
      fail("OPENAI_API_KEY is not set. Export it and rerun, or pass --dry-run.");
    }
  } else if (!process.env.SIMULATION_DELAY_MS) {
    process.env.SIMULATION_DELAY_MS = "0";
  }

  const outFile = path.resolve(process.cwd(), args.out);
  mkdirSync(path.dirname(outFile), { recursive: true });
  const prior = readSweepFile(outFile);
  const outcome = await runSweep({
    cells,
    tasks,
    context: {
      provider: provider.provider,
      model: provider.model,
      baseUrl: provider.baseUrl,
      maxAttempts: args.maxAttempts,
      target: args.target,
      runs: args.runs,
      taskIds: tasks.map((task) => task.id),
      dryRun: args.dryRun,
    },
    maxCalls: args.maxCalls,
    maxCostUsd: args.maxCost,
    delayMs: args.delayMs,
    dryRun: args.dryRun,
    prior,
    client: createRoleClient({ dryRun: args.dryRun }),
    onRecord: (record) => {
      appendSweepRecord(outFile, record);
      console.log(
        `[sweep] wrote ${cellLabel(record)} calls ${record.results.totals.modelCalls} completed ${record.completed}`
      );
    },
    logger: (line) => console.log(line),
  });
  console.log(`Appended ${outcome.appended} record(s) to ${outFile}`);
  if (outcome.stoppedReason) {
    console.error(outcome.stoppedReason);
    process.exit(2);
  }
}

function cellLabel(record: { cell: { method: string; stopping: string; feedback: string; seed: number } }): string {
  return `${record.cell.method} ${record.cell.stopping} ${record.cell.feedback} seed ${record.cell.seed}`;
}

main().catch((error: unknown) => {
  fail(error instanceof Error ? error.message : String(error));
});

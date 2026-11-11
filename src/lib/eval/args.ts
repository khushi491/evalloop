export interface EvalArgs {
  tasks: string[] | null;
  runs: number;
  maxCost: number;
  maxAttempts: number;
  target: number;
  dryRun: boolean;
  outDir: string;
  help: boolean;
}

export interface ReportArgs {
  input: string | null;
  output: string;
  help: boolean;
}

export const EVAL_HELP = `EvalLoop evaluation harness

Usage:
  pnpm eval -- [options]

Options:
  --dry-run            Use the simulation client. No API key and no network.
  --tasks id,id        Run these task ids (default: every fixture).
  --runs N             Repeat each task N times (default: 1).
  --max-attempts N     Improvement attempts per training task (default: 3).
  --target N           Stop a training task when the judge score reaches N (default: 90).
  --max-cost USD       Abort before the next model call once estimated spend reaches this (default: 3).
  --out DIR            Directory for the results JSON (default: evals/results).
  --help               Show this help.

Temperature is fixed at the product loop values (runner 0.4, evaluator 0.1, patcher 0.2).
The command does not start Next.js or a database. Set OPENAI_API_KEY for a live run.
OPENAI_BASE_URL and OPENAI_MODEL are optional (defaults: https://api.openai.com/v1, gpt-4o-mini).
USE_SIMULATION is ignored here; pass --dry-run to simulate.
`;

export const REPORT_HELP = `Write evals/RESULTS.md from an eval results JSON file.

Usage:
  pnpm eval:report -- <results.json>
  pnpm eval:report -- --input <results.json> --output evals/RESULTS.md
`;

function requireValue(flag: string, rest: string[]): string {
  const value = rest.shift();
  if (value === undefined || value.startsWith("--")) {
    throw new Error(`${flag} requires a value`);
  }
  return value;
}

function positiveInt(flag: string, raw: string): number {
  if (!/^[1-9]\d*$/.test(raw)) {
    throw new Error(`${flag} must be a positive integer`);
  }
  return Number(raw);
}

function nonNegative(flag: string, raw: string): number {
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${flag} must be a number greater than or equal to 0`);
  }
  return value;
}

function finiteNumber(flag: string, raw: string): number {
  const value = Number(raw);
  if (!Number.isFinite(value)) throw new Error(`${flag} must be a finite number`);
  return value;
}

export function parseEvalArgs(argv: readonly string[]): EvalArgs {
  const args: EvalArgs = {
    tasks: null,
    runs: 1,
    maxCost: 3,
    maxAttempts: 3,
    target: 90,
    dryRun: false,
    outDir: "evals/results",
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
      case "--dry-run":
        args.dryRun = true;
        break;
      case "--tasks": {
        const ids = requireValue(token, rest)
          .split(",")
          .map((id) => id.trim())
          .filter((id) => id.length > 0);
        if (ids.length === 0) throw new Error("--tasks requires at least one task id");
        args.tasks = ids;
        break;
      }
      case "--runs":
        args.runs = positiveInt("--runs", requireValue(token, rest));
        break;
      case "--max-cost":
        args.maxCost = nonNegative("--max-cost", requireValue(token, rest));
        break;
      case "--max-attempts":
        args.maxAttempts = positiveInt("--max-attempts", requireValue(token, rest));
        break;
      case "--target":
        args.target = finiteNumber("--target", requireValue(token, rest));
        break;
      case "--out":
        args.outDir = requireValue(token, rest);
        break;
      default:
        throw new Error(`Unknown argument: ${token}`);
    }
  }
  return args;
}

export function parseReportArgs(argv: readonly string[]): ReportArgs {
  const args: ReportArgs = {
    input: null,
    output: "evals/RESULTS.md",
    help: false,
  };
  const rest = [...argv];
  while (rest.length > 0) {
    const token = rest.shift()!;
    if (token === "--") continue;
    if (token === "--help" || token === "-h") {
      args.help = true;
    } else if (token === "--input") {
      args.input = requireValue(token, rest);
    } else if (token === "--output") {
      args.output = requireValue(token, rest);
    } else if (token.startsWith("-")) {
      throw new Error(`Unknown argument: ${token}`);
    } else if (args.input === null) {
      args.input = token;
    } else {
      throw new Error(`Unexpected argument: ${token}`);
    }
  }
  return args;
}

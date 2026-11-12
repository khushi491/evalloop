import {
  EVAL_METHODS,
  FEEDBACK_MODES,
  STOPPING_RULES,
  parseChoice,
  type EvalMethod,
  type PatcherFeedback,
  type StoppingRule,
} from "./conditions";

export interface EvalArgs {
  tasks: string[] | null;
  runs: number;
  maxCost: number;
  /** Null means this invocation has no call cap. */
  maxCalls: number | null;
  delayMs: number;
  maxAttempts: number;
  target: number;
  dryRun: boolean;
  outDir: string;
  resume: string | null;
  help: boolean;
  method: EvalMethod;
  stopping: StoppingRule;
  feedback: PatcherFeedback;
  /** Null when the caller does not set a seed. */
  seed: number | null;
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
  --target N           Stop a training task when the blended total reaches N and every hard check passes (default: 90).
  --max-cost USD       Abort before the next model call once this run's estimated spend reaches this (default: 3).
  --max-calls N        Abort before the next model call once this run has made N calls. Default: no call cap.
  --delay-ms N         Wait N milliseconds between model calls in this run (default: 0).
  --resume FILE        Skip task attempts already completed in a results JSON file and continue the suite.
  --out DIR            Directory for the results JSON (default: evals/results).
  --method NAME        single-shot, best-of-n, self-refine, or policy (default: policy).
  --stopping RULE      judge-only or judge-and-hard (default: judge-and-hard).
  --feedback MODE      critique-only, hard-checks-only, or both (default: both).
  --seed N             Integer seed recorded on the run and sent to the provider. Default: unset.
  --help               Show this help.

Every method is capped at the same per-task call budget as a full policy loop
(3 calls per attempt, minus the patcher after the last attempt).
single-shot uses one draft. best-of-n draws as many independent samples as that
budget allows and keeps the highest judge score. self-refine revises the answer
and does not keep a policy. policy is the EvalLoop loop.
Held-out transfer (initial policy, then the frozen learned policy, no further
patching) runs only for policy. The other methods score held-out tasks once.
Temperature is fixed at the product loop values (runner 0.4, evaluator 0.1, patcher 0.2).
The reviser uses the runner temperature. The command does not start Next.js or a database.
Set OPENAI_API_KEY for a live run. A local server can use any non-placeholder value, for example ollama.
OPENAI_BASE_URL and OPENAI_MODEL select any OpenAI-compatible provider
(defaults: https://api.openai.com/v1, gpt-4o-mini).
JSON replies are parsed from the text. response_format is not sent unless OPENAI_JSON_MODE=response_format,
and a provider that rejects that field is retried once without it.
Gemini: OPENAI_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai/ OPENAI_MODEL=gemini-3.5-flash
Ollama: OPENAI_BASE_URL=http://localhost:11434/v1 OPENAI_MODEL=<local-model> OPENAI_API_KEY=ollama
Groq: OPENAI_BASE_URL=https://api.groq.com/openai/v1 OPENAI_MODEL=llama-3.3-70b-versatile
USE_SIMULATION is ignored here; pass --dry-run to simulate.
--max-calls and --max-cost count only calls made in this process. --resume does not charge earlier calls against either cap.
Calls already finished in the resume file are skipped. A training attempt is finished when it has a judge score, the blended total met the target, and every hard check passed, or when the attempt budget is used up. Otherwise the suite continues from the next missing attempt and patches first when the previous patch never landed.
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

function nonNegativeInt(flag: string, raw: string): number {
  if (!/^\d+$/.test(raw)) {
    throw new Error(`${flag} must be an integer greater than or equal to 0`);
  }
  return Number(raw);
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
    maxCalls: null,
    delayMs: 0,
    maxAttempts: 3,
    target: 90,
    dryRun: false,
    outDir: "evals/results",
    resume: null,
    help: false,
    method: "policy",
    stopping: "judge-and-hard",
    feedback: "both",
    seed: null,
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
      case "--max-calls":
        args.maxCalls = nonNegativeInt("--max-calls", requireValue(token, rest));
        break;
      case "--delay-ms":
        args.delayMs = nonNegativeInt("--delay-ms", requireValue(token, rest));
        break;
      case "--resume":
        args.resume = requireValue(token, rest);
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
      case "--method":
        args.method = parseChoice("--method", requireValue(token, rest), EVAL_METHODS);
        break;
      case "--stopping":
        args.stopping = parseChoice("--stopping", requireValue(token, rest), STOPPING_RULES);
        break;
      case "--feedback":
        args.feedback = parseChoice("--feedback", requireValue(token, rest), FEEDBACK_MODES);
        break;
      case "--seed":
        args.seed = nonNegativeInt("--seed", requireValue(token, rest));
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

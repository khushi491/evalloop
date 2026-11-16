import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { EVAL_HELP, parseEvalArgs } from "../src/lib/eval/args";
import { createRoleClient } from "../src/lib/eval/client";
import { resolveProvider } from "../src/lib/eval/provider";
import { assertResultsFile } from "../src/lib/eval/report";
import { runSuite } from "../src/lib/eval/suite";
import { loadTasks, selectTasks } from "../src/lib/eval/tasks";
import type { EvalResults } from "../src/lib/eval/types";
import { loadEnvFile } from "./load-env";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function resultsFileName(iso: string): string {
  return `${iso.replace(/[:.]/g, "-")}.json`;
}

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

async function main() {
  let args;
  try {
    args = parseEvalArgs(process.argv.slice(2));
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  }
  if (args.help) {
    console.log(EVAL_HELP);
    return;
  }

  loadEnvFile(path.join(repoRoot, ".env"));

  if (!args.dryRun) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey || apiKey === "sk-placeholder") {
      fail(
        "OPENAI_API_KEY is not set. Export it and rerun, or pass --dry-run to use the simulation client."
      );
    }
  } else if (!process.env.SIMULATION_DELAY_MS) {
    process.env.SIMULATION_DELAY_MS = "0";
  }

  let tasks;
  try {
    tasks = selectTasks(loadTasks(), args.tasks);
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  }

  let prior: EvalResults | null = null;
  let resumedFrom: string | null = null;
  if (args.resume) {
    const resumePath = path.resolve(process.cwd(), args.resume);
    let parsed: unknown;
    try {
      parsed = JSON.parse(readFileSync(resumePath, "utf8"));
    } catch (error) {
      fail(
        `Could not read --resume file ${resumePath}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
    try {
      prior = assertResultsFile(parsed);
    } catch (error) {
      fail(
        `Could not use --resume file ${resumePath}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
    resumedFrom = resumePath;
  }

  const provider = resolveProvider();
  const model = provider.model;
  const callCap = args.maxCalls === null ? "none" : String(args.maxCalls);
  const seedLabel = args.seed === null ? "none" : String(args.seed);
  console.log(
    `EvalLoop eval: ${tasks.length} tasks, method ${args.method}, stopping ${args.stopping}, ` +
      `feedback ${args.feedback}, seed ${seedLabel}, runs ${args.runs}, max attempts ${args.maxAttempts}, ` +
      `target ${args.target}, max cost $${args.maxCost}, max calls ${callCap}, ` +
      `delay ${args.delayMs}ms, provider ${provider.provider}, model ${model}, base ${provider.baseUrl}, ` +
      `${args.dryRun ? "dry run" : "live API"}` +
      (resumedFrom ? `, resuming ${resumedFrom}` : "")
  );

  const results = await runSuite({
    tasks,
    runs: args.runs,
    maxAttempts: args.maxAttempts,
    targetScore: args.target,
    maxCostUsd: args.maxCost,
    maxCalls: args.maxCalls,
    delayMs: args.delayMs,
    dryRun: args.dryRun,
    model,
    method: args.method,
    stopping: args.stopping,
    feedback: args.feedback,
    seed: args.seed,
    baseUrl: provider.baseUrl,
    provider: provider.provider,
    client: createRoleClient({ dryRun: args.dryRun }),
    prior,
    resumedFrom,
    logger: (line) => console.log(line),
  });

  const outDir = path.resolve(process.cwd(), args.outDir);
  mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, resultsFileName(results.generatedAt));
  writeFileSync(outFile, `${JSON.stringify(results, null, 2)}\n`);
  console.log(`Wrote ${outFile}`);
  console.log(
    `Model calls ${results.totals.modelCalls}, estimated cost $${results.totals.estimatedCostUsd}`
  );
  if (results.aborted) {
    console.error(results.abortReason);
    process.exit(2);
  }
}

main().catch((error: unknown) => {
  fail(error instanceof Error ? error.message : String(error));
});

import { readFileSync } from "node:fs";
import path from "node:path";
import { analyzeResults } from "../src/lib/eval/analyze";
import { writeFigures } from "../src/lib/eval/figures";
import { readSweepFile } from "../src/lib/eval/sweep";
import { assertResultsFile } from "../src/lib/eval/report";
import type { EvalResults } from "../src/lib/eval/types";

const HELP = `Turn eval results into tables and figures.

Usage:
  pnpm analyze -- --input FILE [--input FILE] --out paper/figures

FILE may be one eval results JSON or a sweep JSONL.
A dry run is labeled MOCK DATA on every figure. A directory that mixes a dry
run with a live run is also labeled mock.
`;

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

function loadInput(file: string): EvalResults[] {
  const resolved = path.resolve(process.cwd(), file);
  const text = readFileSync(resolved, "utf8");
  if (resolved.endsWith(".jsonl")) {
    return readSweepFile(resolved).map((record) => record.results);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`${resolved}: ${detail}`);
  }
  if (Array.isArray(parsed)) {
    return parsed.map((item) => assertResultsFile(item));
  }
  return [assertResultsFile(parsed)];
}

function main() {
  const inputs: string[] = [];
  let out = "paper/figures";
  const rest = process.argv.slice(2);
  while (rest.length > 0) {
    const token = rest.shift()!;
    if (token === "--" || token === "--help" || token === "-h") {
      if (token !== "--") {
        console.log(HELP);
        return;
      }
      continue;
    }
    if (token === "--input") {
      const value = rest.shift();
      if (!value) fail("--input requires a file");
      inputs.push(value);
      continue;
    }
    if (token === "--out") {
      const value = rest.shift();
      if (!value) fail("--out requires a directory");
      out = value;
      continue;
    }
    if (token.startsWith("-")) fail(`Unknown argument: ${token}`);
    inputs.push(token);
  }
  if (inputs.length === 0) fail("Pass --input with a results JSON or a sweep JSONL file.");
  const files = inputs.flatMap((file) => loadInput(file));
  const analysis = analyzeResults(files);
  const written = writeFigures(path.resolve(process.cwd(), out), analysis);
  console.log(
    `${analysis.mock ? "MOCK DATA" : "Live run"}: ${analysis.sources.files} files ` +
      `(${analysis.sources.dryRuns} dry, ${analysis.sources.liveRuns} live)`
  );
  for (const file of written) console.log(file);
}

main();

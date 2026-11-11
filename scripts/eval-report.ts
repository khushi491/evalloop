import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { REPORT_HELP, parseReportArgs } from "../src/lib/eval/args";
import { assertResultsFile, renderResultsMarkdown } from "../src/lib/eval/report";

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

function main() {
  let args;
  try {
    args = parseReportArgs(process.argv.slice(2));
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  }
  if (args.help) {
    console.log(REPORT_HELP);
    return;
  }
  if (!args.input) {
    fail("Pass the results JSON path. Example: pnpm eval:report -- evals/results/<timestamp>.json");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(args.input, "utf8"));
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  }

  let results;
  try {
    results = assertResultsFile(parsed);
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  }

  const output = path.resolve(process.cwd(), args.output);
  writeFileSync(output, renderResultsMarkdown(results));
  console.log(`Wrote ${output}`);
}

main();

import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { repoRoot } from "./test-env";
import {
  loadCommittedMeasuredResults,
  measuredViewFromResults,
} from "../src/lib/measured-results";
import { assertResultsFile } from "../src/lib/eval/report";

describe("committed measured results", () => {
  it("formats the committed JSON with the report strings", () => {
    const view = loadCommittedMeasuredResults(repoRoot);
    const report = fs.readFileSync(path.join(repoRoot, "evals/RESULTS.md"), "utf8");
    const results = assertResultsFile(
      JSON.parse(
        fs.readFileSync(path.join(repoRoot, "evals/results/2026-11-14T09-15-50-116Z.json"), "utf8")
      )
    );

    expect(results.dryRun).toBe(false);
    expect(view.dryRun).toBe(false);
    expect(view.generatedAt).toBe(results.generatedAt);
    expect(view.model).toBe(results.config.model);
    expect(view.sourceJson).toBe("evals/results/2026-11-14T09-15-50-116Z.json");
    expect(report).toContain(`Generated: ${view.generatedAt}`);
    expect(report).toContain(`| Model | ${view.model} |`);
    expect(report).toContain(view.policySummary);
    expect(report).toContain(
      `| **Average** | | | ${view.training.average.before.hardCheck} | ${view.training.average.before.judge} | ${view.training.average.before.total} | ${view.training.average.after.hardCheck} | ${view.training.average.after.judge} | ${view.training.average.after.total} |`
    );
    expect(report).toContain(
      `| **Average** | | ${view.heldOut.average.initial.hardCheck} | ${view.heldOut.average.initial.judge} | ${view.heldOut.average.initial.total} | ${view.heldOut.average.learned.hardCheck} | ${view.heldOut.average.learned.judge} | ${view.heldOut.average.learned.total} |`
    );
    expect(report).toContain(`| Estimated cost | ${view.cost.estimated} |`);
    expect(report).toContain(`| Prompt tokens | ${view.cost.promptTokens} |`);
    expect(report).toContain(`| Cached prompt tokens | ${view.cost.cachedPromptTokens} |`);
    expect(report).toContain(`| Completion tokens | ${view.cost.completionTokens} |`);
    expect(report).toContain(`| Model calls | ${view.cost.modelCalls} |`);
    expect(report).toContain(`| Calls missing usage | ${view.cost.callsMissingUsage} |`);

    for (const row of [...view.training.rows, ...view.heldOut.rows]) {
      expect(report).toContain(`\`${row.id}\``);
    }
    expect(JSON.stringify(view)).not.toContain("Demo mode");
    expect(JSON.stringify(view).toLowerCase()).not.toContain("simulated");
  });

  it("refuses to present a dry run as measured results", () => {
    const results = assertResultsFile(
      JSON.parse(
        fs.readFileSync(path.join(repoRoot, "evals/results/2026-11-14T09-15-50-116Z.json"), "utf8")
      )
    );
    expect(() => measuredViewFromResults({ ...results, dryRun: true })).toThrow(/dry-run/i);
  });
});

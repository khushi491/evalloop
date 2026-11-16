import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { bootstrapMean } from "../src/lib/eval/analyze";
import { analyzeResults } from "../src/lib/eval/analyze";
import { upperBoundCalls } from "../src/lib/eval/estimate";
import { writeFigures } from "../src/lib/eval/figures";
import { resolveProvider } from "../src/lib/eval/provider";
import { runSuite } from "../src/lib/eval/suite";
import {
  MINIMAL_TASK_IDS,
  appendSweepRecord,
  cellKey,
  estimateCells,
  geminiMainCells,
  localRemainderCells,
  readSweepFile,
  runSweep,
  sweepMatrix,
} from "../src/lib/eval/sweep";
import { loadTasks, selectTasks } from "../src/lib/eval/tasks";
import type { EvalTask } from "../src/lib/eval/tasks";
import type { RoleClient } from "../src/lib/eval/client";
import type { EvalResults } from "../src/lib/eval/types";
import { DEFAULT_POLICY } from "../src/lib/schemas";

function task(id: string, split: "train" | "heldout"): EvalTask {
  return {
    id,
    title: id,
    split,
    category: "constrained-writing",
    prompt: `Prompt ${id}`,
    constraints: ["Stay short"],
    checks: [{ id: "words", type: "max_words", max: 20 }],
  };
}

function client(): RoleClient {
  return {
    async runner() {
      return {
        content: "hello from the runner",
        usage: { prompt_tokens: 4, completion_tokens: 1, total_tokens: 5, cached_tokens: 0 },
        attempts: 1,
      };
    },
    async evaluator() {
      return {
        data: {
          score_total: 0,
          score_breakdown: {
            constraint_coverage: 1,
            clarity_structure: 1,
            tone: 1,
            safety: 1,
            tool_correctness: 1,
          },
          violations: [],
          notes: "scripted",
        },
        usage: { prompt_tokens: 4, completion_tokens: 1, total_tokens: 5, cached_tokens: 0 },
        attempts: 1,
      };
    },
    async patcher() {
      return {
        data: {
          new_rules: [],
          remove_rules: [],
          update_style: {},
          update_checklist: [],
          rationale: "none",
        },
        usage: { prompt_tokens: 4, completion_tokens: 1, total_tokens: 5, cached_tokens: 0 },
        attempts: 1,
      };
    },
  };
}

describe("sweep", () => {
  it("builds a method by condition by seed matrix and an upper bound", () => {
    const cells = sweepMatrix({ seeds: [1, 2] });
    expect(cells.filter((cell) => cell.method === "single-shot")).toHaveLength(2);
    expect(cells.filter((cell) => cell.method === "policy")).toHaveLength(12);
    expect(cells.filter((cell) => cell.method === "self-refine")).toHaveLength(12);
    const one = upperBoundCalls({
      method: "policy",
      trainingTasks: 20,
      heldOutTasks: 10,
      runs: 1,
      maxAttempts: 3,
    });
    expect(one).toBe(200);
    const minimalTasks = selectTasks(loadTasks(), [...MINIMAL_TASK_IDS]);
    expect(minimalTasks.filter((item) => item.split === "train")).toHaveLength(4);
    expect(minimalTasks.filter((item) => item.split === "heldout")).toHaveLength(4);
    const gemini = estimateCells(geminiMainCells([1, 2, 3]), minimalTasks, 2, 1);
    const local = estimateCells(localRemainderCells([1, 2, 3]), minimalTasks, 2, 1);
    expect(gemini.total).toBe(348);
    expect(local.total).toBe(1020);
    expect(gemini.total + local.total).toBe(
      estimateCells(sweepMatrix({ seeds: [1, 2, 3] }), minimalTasks, 2, 1).total
    );
  });

  it("appends a cell, stops at the call budget, and skips a finished cell on resume", async () => {
    const tasks = [task("alpha", "train")];
    const context = {
      provider: "ollama",
      model: "llama3.2",
      baseUrl: "http://localhost:11434/v1",
      maxAttempts: 1,
      target: 90,
      runs: 1,
      taskIds: ["alpha"],
      dryRun: true,
    };
    const cells = sweepMatrix({ seeds: [1, 2], methods: ["single-shot"] });
    const dir = mkdtempSync(path.join(tmpdir(), "evalloop-sweep-"));
    const file = path.join(dir, "sweep.jsonl");
    const first: unknown[] = [];
    const stopped = await runSweep({
      cells,
      tasks,
      context,
      maxCalls: 2,
      maxCostUsd: 3,
      delayMs: 0,
      dryRun: true,
      prior: [],
      client: client(),
      onRecord: (record) => {
        appendSweepRecord(file, record);
        first.push(record.cell.seed);
      },
    });
    expect(stopped.appended).toBe(1);
    expect(stopped.stoppedReason).toMatch(/max-calls/);
    const saved = readSweepFile(file);
    expect(saved).toHaveLength(1);
    expect(saved[0]?.completed).toBe(true);
    expect(saved[0]?.key).toBe(cellKey(cells[0]!, context));

    const second: number[] = [];
    const resumed = await runSweep({
      cells,
      tasks,
      context,
      maxCalls: 2,
      maxCostUsd: 3,
      delayMs: 0,
      dryRun: true,
      prior: saved,
      client: client(),
      onRecord: (record) => {
        appendSweepRecord(file, record);
        second.push(record.cell.seed);
      },
    });
    expect(second).toEqual([2]);
    expect(resumed.stoppedReason).toBeNull();
    const all = readSweepFile(file);
    expect(all.map((record) => record.cell.seed)).toEqual([1, 2]);
    expect(all[0]?.results.totals.modelCalls).toBe(2);
  });
});

describe("analysis figures", () => {
  it("bootstraps a mean and renders mock figures from a dry run", async () => {
    expect(bootstrapMean([])).toBeNull();
    const once = bootstrapMean([1, 2, 3, 4], { seed: 7, samples: 200 });
    const again = bootstrapMean([1, 2, 3, 4], { seed: 7, samples: 200 });
    expect(once).toEqual(again);
    expect(once?.mean).toBe(2.5);
    expect(once!.low).toBeLessThanOrEqual(once!.mean);
    expect(once!.high).toBeGreaterThanOrEqual(once!.mean);
    expect(bootstrapMean([5])?.low).toBe(5);

    const tasks = [task("alpha", "train"), task("beta", "heldout")];
    const results = await runSuite({
      tasks,
      runs: 1,
      maxAttempts: 1,
      targetScore: 90,
      maxCostUsd: 3,
      dryRun: true,
      model: "gpt-4o-mini",
      client: client(),
      now: new Date("2026-11-12T00:00:00.000Z"),
    });
    expect(results.dryRun).toBe(true);
    const analysis = analyzeResults([results], { samples: 50 });
    expect(analysis.mock).toBe(true);
    const dir = mkdtempSync(path.join(tmpdir(), "evalloop-figures-"));
    const written = writeFigures(dir, analysis);
    const pdf = readFileSync(written.find((file) => file.endsWith("gap-by-iteration.pdf"))!);
    const png = readFileSync(written.find((file) => file.endsWith("hard-check-by-method.png"))!);
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(pdf.toString("latin1")).toContain("MOCK DATA");
    expect(png.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
    expect(png.toString("latin1")).toContain("MOCK DATA");
    const live = { ...results, dryRun: false } as EvalResults;
    expect(analyzeResults([live]).mock).toBe(false);
    expect(results.learnedPolicy.rules.length).toBeGreaterThanOrEqual(DEFAULT_POLICY.rules.length);
  });
});

describe("provider config", () => {
  it("labels Gemini and Ollama from the base URL without reading a key", () => {
    expect(
      resolveProvider({
        OPENAI_BASE_URL: "https://generativelanguage.googleapis.com/v1beta/openai/",
        OPENAI_MODEL: "gemini-3.5-flash",
      }).provider
    ).toBe("gemini");
    expect(
      resolveProvider({
        OPENAI_BASE_URL: "http://localhost:11434/v1/",
        OPENAI_MODEL: "llama3.2",
      })
    ).toMatchObject({
      provider: "ollama",
      model: "llama3.2",
      baseUrl: "http://localhost:11434/v1",
    });
    expect(
      resolveProvider({
        OPENAI_BASE_URL: "http://localhost:11434/v1",
        OPENAI_MODEL: "llama3.2",
        EVAL_PROVIDER: "lab-box",
      }).provider
    ).toBe("lab-box");
  });
});

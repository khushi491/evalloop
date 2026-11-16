import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { countWords, extractJsonDocument, runHardChecks } from "../src/lib/eval/checks";
import { loadTasks, selectTasks } from "../src/lib/eval/tasks";
import type { HardCheck } from "../src/lib/eval/checks";

describe("hard checks", () => {
  it("counts words on whitespace and treats an empty string as zero", () => {
    expect(countWords("  one   two\nthree ")).toBe(3);
    expect(countWords("   ")).toBe(0);
  });

  it("treats the word cap as inclusive", () => {
    const check: HardCheck = { id: "max", type: "max_words", max: 5 };
    expect(runHardChecks("one two three four five", [check]).results[0]?.pass).toBe(true);
    expect(runHardChecks("one two three four five six", [check]).results[0]?.pass).toBe(false);
  });

  it("enforces word limits, keywords, headings, and forbidden text", () => {
    const checks: HardCheck[] = [
      { id: "max", type: "max_words", max: 40 },
      { id: "min", type: "min_words", min: 2 },
      { id: "words", type: "required_keywords", keywords: ["Refund", "order"] },
      { id: "heads", type: "required_headings", headings: ["Status", "Next update"] },
      { id: "ban", type: "forbidden_substrings", substrings: ["our fault"] },
      { id: "need", type: "required_regex", pattern: "last\\s+4\\b", flags: "i" },
      { id: "digits", type: "forbidden_regex", pattern: "\\b\\d{13,19}\\b" },
    ];
    const output = [
      "## Status:",
      "Refund the order and ask for the last 4 digits.",
      "## Next update",
      "Soon.",
    ].join("\n");

    const report = runHardChecks(output, checks);
    expect(report.results.map((item) => [item.id, item.pass])).toEqual([
      ["max", true],
      ["min", true],
      ["words", true],
      ["heads", true],
      ["ban", true],
      ["need", true],
      ["digits", true],
    ]);
    expect(report.passRate).toBe(1);

    const failing = runHardChecks(
      "## Status\nOur fault. Card 4111111111111111.",
      checks
    );
    expect(failing.results.find((item) => item.id === "words")?.message).toMatch(/Missing keywords/);
    expect(failing.results.find((item) => item.id === "heads")?.message).toMatch(/Next update/);
    expect(failing.results.find((item) => item.id === "ban")?.pass).toBe(false);
    expect(failing.results.find((item) => item.id === "digits")?.pass).toBe(false);
    expect(failing.passed).toBe(2);
    expect(failing.total).toBe(7);
    expect(failing.passRate).toBeCloseTo(2 / 7);
  });

  it("accepts a fenced JSON object and rejects prose, arrays, and missing keys", () => {
    const checks: HardCheck[] = [
      { id: "shape", type: "json", requiredKeys: ["version", "fixes"] },
    ];
    expect(
      runHardChecks('```json\n{"version":"1.2.3","fixes":[]}\n```', checks).results[0]?.pass
    ).toBe(true);
    expect(runHardChecks("here is {\"version\": 1}", checks).results[0]?.pass).toBe(false);
    expect(runHardChecks("[1, 2, 3]", checks).results[0]?.message).toMatch(/object/);
    expect(
      runHardChecks('{"version":"1.0.0"}', checks).results[0]?.message
    ).toMatch(/Missing keys: fixes/);
    expect(extractJsonDocument('\uFEFF{"ok":true}')).toEqual({ ok: true });
  });

  it("checks a regular expression against samples and rejects an unsafe pattern", () => {
    const checks: HardCheck[] = [
      {
        id: "behavior",
        type: "regex_spec",
        mustMatch: ["a@b.co"],
        mustNotMatch: ["a@"],
      },
    ];
    expect(runHardChecks("/^a@b\\.co$/", checks).results[0]?.pass).toBe(true);
    expect(runHardChecks("/a/", checks).results[0]?.pass).toBe(false);
    const unsafe = runHardChecks("/(a+)+/", checks);
    expect(unsafe.results[0]?.pass).toBe(false);
    expect(unsafe.results[0]?.message).toMatch(/unsafe/);
  });

  it("applies a JSON replacement rule to every case", () => {
    const checks: HardCheck[] = [
      {
        id: "behavior",
        type: "replace_spec",
        cases: [
          { input: "a/b/c", output: "a-b-c" },
          { input: "no-slash", output: "no-slash" },
        ],
      },
    ];
    const output = JSON.stringify({ pattern: "/", replacement: "-", flags: "g" });
    expect(runHardChecks(output, checks).results[0]?.pass).toBe(true);
    expect(
      runHardChecks(JSON.stringify({ pattern: "/", replacement: "-", flags: "" }), checks).results[0]?.pass
    ).toBe(true);
    expect(runHardChecks('{"pattern":"(a+)+","replacement":"-","flags":"g"}', checks).results[0]?.pass).toBe(
      false
    );
  });
});

describe("task fixtures", () => {
  const tasks = loadTasks();

  it("loads thirty tasks, twenty for training and ten held out", () => {
    expect(tasks).toHaveLength(30);
    expect(tasks.filter((task) => task.split === "train")).toHaveLength(20);
    expect(tasks.filter((task) => task.split === "heldout")).toHaveLength(10);
    const heldOut = tasks.filter((task) => task.split === "heldout").map((task) => task.id);
    expect(heldOut).toEqual(expect.arrayContaining(["invoice-json", "security-advisory", "status-update"]));
    for (const category of ["structured-output", "constrained-writing", "summarization", "code-regex"]) {
      expect(tasks.some((task) => task.split === "train" && task.category === category)).toBe(true);
      expect(tasks.some((task) => task.split === "heldout" && task.category === category)).toBe(true);
    }
    expect(new Set(tasks.map((task) => task.id)).size).toBe(tasks.length);
    for (const task of tasks) {
      expect(task.checks.length).toBeGreaterThan(0);
      expect(task.prompt.length).toBeGreaterThan(0);
    }
  });

  it("selects tasks by id and rejects an unknown id", () => {
    expect(selectTasks(tasks, ["status-update", "bug-report"]).map((task) => task.id)).toEqual([
      "status-update",
      "bug-report",
    ]);
    expect(() => selectTasks(tasks, ["missing-task"])).toThrow(/Unknown task id: missing-task/);
  });

  it("rejects a fixture whose regular expression does not compile", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "evalloop-tasks-"));
    writeFileSync(
      path.join(dir, "broken.json"),
      JSON.stringify({
        id: "broken",
        title: "Broken",
        split: "train",
        category: "constrained-writing",
        prompt: "Return text.",
        constraints: ["Must match a pattern"],
        checks: [{ id: "bad", type: "required_regex", pattern: "(" }],
      })
    );
    expect(() => loadTasks(dir)).toThrow(/invalid regular expression/);
  });
});

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { assertChecksCompile, HardCheckSchema, type HardCheck } from "./checks";

export const TASK_CATEGORIES = [
  "structured-output",
  "constrained-writing",
  "summarization",
  "code-regex",
] as const;

export type TaskCategory = (typeof TASK_CATEGORIES)[number];

const TaskSchema = z.object({
  id: z
    .string()
    .trim()
    .min(1)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "id must be lowercase kebab-case"),
  title: z.string().trim().min(1),
  split: z.enum(["train", "heldout"]),
  category: z.enum(TASK_CATEGORIES),
  prompt: z.string().trim().min(1),
  constraints: z.array(z.string().trim().min(1)).min(1),
  checks: z.array(HardCheckSchema).min(1),
});

export type EvalTask = z.infer<typeof TaskSchema> & { checks: HardCheck[] };

const here = path.dirname(fileURLToPath(import.meta.url));

export function defaultTasksDir(): string {
  return path.resolve(here, "../../../evals/tasks");
}

export function loadTasks(directory = defaultTasksDir()): EvalTask[] {
  const files = readdirSync(directory)
    .filter((name) => name.endsWith(".json"))
    .sort((left, right) => left.localeCompare(right));
  if (files.length === 0) {
    throw new Error(`No task fixtures in ${directory}`);
  }

  const tasks: EvalTask[] = [];
  const seen = new Set<string>();
  for (const file of files) {
    const fullPath = path.join(directory, file);
    let raw: unknown;
    try {
      raw = JSON.parse(readFileSync(fullPath, "utf8"));
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new Error(`${file}: ${detail}`);
    }
    const parsed = TaskSchema.safeParse(raw);
    if (!parsed.success) {
      throw new Error(`${file}: ${parsed.error.issues.map((issue) => issue.message).join("; ")}`);
    }
    if (seen.has(parsed.data.id)) {
      throw new Error(`${file}: duplicate task id "${parsed.data.id}"`);
    }
    if (parsed.data.id !== path.basename(file, ".json")) {
      throw new Error(`${file}: id "${parsed.data.id}" must match the file name`);
    }
    seen.add(parsed.data.id);
    assertChecksCompile(parsed.data.checks, file);
    tasks.push(parsed.data);
  }

  return tasks.sort((left, right) => left.id.localeCompare(right.id));
}

export function selectTasks(tasks: readonly EvalTask[], ids: readonly string[] | null): EvalTask[] {
  if (ids === null) return [...tasks];
  const wanted = [...new Set(ids)];
  const known = new Map(tasks.map((task) => [task.id, task]));
  const missing = wanted.filter((id) => !known.has(id));
  if (missing.length > 0) {
    throw new Error(`Unknown task id: ${missing.join(", ")}`);
  }
  return wanted.map((id) => known.get(id)!);
}

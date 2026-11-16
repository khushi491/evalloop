import { randomBytes, randomUUID } from "node:crypto";
import type { Policy } from "./schemas";
import type { RunAttempt, RunPolicyVersion, RunSeed, RunSummary, StoredRun } from "./run-types";

interface MemoryState {
  runs: Map<string, StoredRun>;
  tombstones: Set<string>;
}

const globalStore = globalThis as typeof globalThis & {
  __evalloopMemory?: MemoryState;
};

function state(): MemoryState {
  if (!globalStore.__evalloopMemory) {
    globalStore.__evalloopMemory = { runs: new Map(), tombstones: new Set() };
  }
  return globalStore.__evalloopMemory;
}

export function resetMemoryStore(): void {
  globalStore.__evalloopMemory = { runs: new Map(), tombstones: new Set() };
}

interface EncodedSpec {
  t: string;
  x: string;
  m: number;
  s: number;
  c: string;
  n: string;
}

function encodeId(spec: EncodedSpec): string {
  return `d1_${Buffer.from(JSON.stringify(spec), "utf8").toString("base64url")}`;
}

function decodeId(id: string): RunSeed | null {
  if (!id.startsWith("d1_")) return null;
  try {
    const parsed = JSON.parse(Buffer.from(id.slice(3), "base64url").toString("utf8")) as Partial<EncodedSpec>;
    if (typeof parsed.t !== "string" || typeof parsed.x !== "string") return null;
    const maxAttempts = parsed.m;
    const targetScore = parsed.s;
    if (typeof maxAttempts !== "number" || typeof targetScore !== "number") return null;
    if (!Number.isInteger(maxAttempts) || !Number.isInteger(targetScore)) return null;
    if (typeof parsed.c !== "string") return null;
    return {
      title: parsed.t,
      taskText: parsed.x,
      maxAttempts,
      targetScore,
      createdAt: parsed.c,
    };
  } catch {
    return null;
  }
}

function makeRun(id: string, seed: RunSeed): StoredRun {
  return {
    id,
    title: seed.title,
    taskText: seed.taskText,
    maxAttempts: seed.maxAttempts,
    targetScore: seed.targetScore,
    status: "pending",
    createdAt: seed.createdAt ?? new Date().toISOString(),
    attempts: [],
    policyVersions: [],
  };
}

function clone(run: StoredRun): StoredRun {
  return structuredClone(run);
}

export function createMemoryRun(seed: RunSeed): StoredRun {
  const createdAt = seed.createdAt ?? new Date().toISOString();
  const spec: EncodedSpec = {
    t: seed.title,
    x: seed.taskText,
    m: seed.maxAttempts,
    s: seed.targetScore,
    c: createdAt,
    n: randomBytes(4).toString("hex"),
  };
  let id = encodeId(spec);
  if (id.length > 1500) {
    id = `m1_${randomUUID()}`;
  }
  const run = makeRun(id, { ...seed, createdAt });
  state().runs.set(id, run);
  return clone(run);
}

export function getMemoryRun(id: string): StoredRun | null {
  const current = state();
  if (current.tombstones.has(id)) return null;
  const existing = current.runs.get(id);
  if (existing) return clone(existing);
  const decoded = decodeId(id);
  if (!decoded) return null;
  const run = makeRun(id, decoded);
  current.runs.set(id, run);
  return clone(run);
}

/**
 * Insert a run the browser already knows when this instance has never seen it.
 * Used so execute can finish on a different serverless instance than create.
 */
export function rememberMemoryRun(id: string, seed: RunSeed): StoredRun | null {
  const current = state();
  if (current.tombstones.has(id)) return null;
  const existing = current.runs.get(id);
  if (existing) return clone(existing);
  const decoded = decodeId(id);
  const source = decoded ?? seed;
  if (!source.taskText.trim()) return null;
  const run = makeRun(id, source);
  current.runs.set(id, run);
  return clone(run);
}

export function editMemoryRun(id: string, edit: (run: StoredRun) => void): void {
  const run = state().runs.get(id);
  if (!run) throw new Error(`Run ${id} not found`);
  edit(run);
}

export function deleteMemoryRun(id: string): boolean {
  const current = state();
  const existed = current.runs.delete(id) || decodeId(id) !== null;
  current.tombstones.add(id);
  return existed;
}

export function listMemoryRuns(): RunSummary[] {
  return [...state().runs.values()]
    .map((run) => {
      const scores = run.attempts
        .map((attempt) => attempt.scoreTotal)
        .filter((score): score is number => score !== null);
      return {
        id: run.id,
        title: run.title,
        createdAt: run.createdAt,
        status: run.status,
        attemptCount: run.attempts.length,
        bestScore: scores.length > 0 ? Math.max(...scores) : null,
      };
    })
    .sort((left, right) => (left.createdAt < right.createdAt ? 1 : -1));
}

export function memoryAttempt(attempt: {
  index: number;
  outputText: string;
  scoreTotal: number;
  scoreBreakdown: RunAttempt["scoreBreakdown"];
  violations: RunAttempt["violations"];
  notes: string | null;
}): RunAttempt {
  return {
    id: randomUUID(),
    index: attempt.index,
    outputText: attempt.outputText,
    createdAt: new Date().toISOString(),
    scoreTotal: attempt.scoreTotal,
    scoreBreakdown: attempt.scoreBreakdown,
    violations: attempt.violations,
    notes: attempt.notes,
  };
}

export function memoryPolicy(policy: Policy): RunPolicyVersion {
  return {
    id: randomUUID(),
    version: policy.version,
    policy: structuredClone(policy),
    createdAt: new Date().toISOString(),
  };
}

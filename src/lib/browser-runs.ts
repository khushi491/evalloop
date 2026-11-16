import type { RunResponse, RunSummary } from "./run-types";

const STORAGE_KEY = "evalloop.memoryRuns.v1";

function readAll(): RunResponse[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is RunResponse => {
      if (!item || typeof item !== "object") return false;
      const run = item as Partial<RunResponse>;
      return typeof run.id === "string" && Array.isArray(run.attempts);
    });
  } catch {
    return [];
  }
}

function writeAll(runs: RunResponse[]): void {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(runs.slice(0, 30)));
}

export function loadBrowserRun(id: string): RunResponse | null {
  return readAll().find((run) => run.id === id) ?? null;
}

export function saveBrowserRun(run: RunResponse): void {
  if (!run.memory || typeof window === "undefined") return;
  const next = [run, ...readAll().filter((item) => item.id !== run.id)];
  writeAll(next);
}

export function removeBrowserRun(id: string): void {
  if (typeof window === "undefined") return;
  writeAll(readAll().filter((run) => run.id !== id));
}

export function listBrowserRuns(): RunSummary[] {
  return readAll().map((run) => {
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
  });
}

export function preferRun(server: RunResponse | null, local: RunResponse | null): RunResponse | null {
  if (!server) return local;
  if (!local || local.id !== server.id) return server;
  if (local.attempts.length > server.attempts.length) return local;
  if (local.attempts.length === server.attempts.length) {
    const rank = (status: string) =>
      status === "completed" || status === "failed" ? 2 : status === "running" ? 1 : 0;
    if (rank(local.status) > rank(server.status)) return local;
  }
  return server;
}

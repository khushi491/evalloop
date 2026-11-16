import { prisma } from "./db";
import { attachMode, usesMemoryStore } from "./demo-mode";
import type { RunModeFields } from "./run-types";
import {
  createMemoryRun,
  deleteMemoryRun,
  getMemoryRun,
  listMemoryRuns,
} from "./memory-store";
import type { RunResponse, RunSeed, RunSummary } from "./run-types";

function summaryFromPrisma(run: {
  id: string;
  title: string;
  createdAt: Date;
  status: string;
  attempts: { scoreTotal: number | null }[];
}): RunSummary {
  const scores = run.attempts
    .map((attempt) => attempt.scoreTotal)
    .filter((score): score is number => score !== null);
  return {
    id: run.id,
    title: run.title,
    createdAt: run.createdAt.toISOString(),
    status: run.status,
    attemptCount: run.attempts.length,
    bestScore: scores.length > 0 ? Math.max(...scores) : null,
  };
}

export async function readPrismaRun(runId: string): Promise<RunResponse | null> {
  const run = await prisma.projectRun.findUnique({
    where: { id: runId },
    include: {
      attempts: { orderBy: { index: "asc" } },
      policyVersions: { orderBy: { version: "asc" } },
    },
  });
  if (!run) return null;

  return attachMode({
    id: run.id,
    title: run.title,
    taskText: run.taskText,
    maxAttempts: run.maxAttempts,
    targetScore: run.targetScore,
    status: run.status,
    createdAt: run.createdAt.toISOString(),
    attempts: run.attempts.map((attempt) => {
      const violData = attempt.violationsJson ? JSON.parse(attempt.violationsJson) : null;
      const isWrapped = violData && "violations" in violData;
      return {
        id: attempt.id,
        index: attempt.index,
        outputText: attempt.outputText,
        createdAt: attempt.createdAt.toISOString(),
        scoreTotal: attempt.scoreTotal,
        scoreBreakdown: attempt.scoreBreakdownJson ? JSON.parse(attempt.scoreBreakdownJson) : null,
        violations: isWrapped ? violData.violations : violData,
        notes: isWrapped ? violData.notes : null,
      };
    }),
    policyVersions: run.policyVersions.map((policy) => ({
      id: policy.id,
      version: policy.version,
      policy: JSON.parse(policy.policyJson),
      createdAt: policy.createdAt.toISOString(),
    })),
  });
}

export async function listProjectRuns(): Promise<{ runs: RunSummary[] } & RunModeFields> {
  const mode = attachMode({});
  if (usesMemoryStore()) {
    return { ...mode, runs: listMemoryRuns() };
  }
  const runs = await prisma.projectRun.findMany({
    orderBy: { createdAt: "desc" },
    include: { attempts: { select: { scoreTotal: true } } },
  });
  return { ...mode, runs: runs.map(summaryFromPrisma) };
}

export async function createProjectRun(seed: RunSeed): Promise<RunResponse> {
  if (usesMemoryStore()) {
    return attachMode(createMemoryRun(seed));
  }
  const run = await prisma.projectRun.create({
    data: {
      title: seed.title,
      taskText: seed.taskText,
      maxAttempts: seed.maxAttempts,
      targetScore: seed.targetScore,
    },
  });
  const loaded = await readPrismaRun(run.id);
  if (!loaded) throw new Error("Failed to create run");
  return loaded;
}

export async function readProjectRun(runId: string): Promise<RunResponse | null> {
  if (usesMemoryStore()) {
    const run = getMemoryRun(runId);
    return run ? attachMode(run) : null;
  }
  return readPrismaRun(runId);
}

export async function removeProjectRun(runId: string): Promise<boolean> {
  if (usesMemoryStore()) {
    return deleteMemoryRun(runId);
  }
  try {
    await prisma.projectRun.delete({ where: { id: runId } });
    return true;
  } catch {
    return false;
  }
}

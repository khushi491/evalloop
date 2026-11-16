import { prisma } from "./db";
import { attachMode, usesMemoryStore, usesSimulationClient } from "./demo-mode";
import { runImprovementLoop } from "./improvement-loop";
import { chatCompletion, chatCompletionJSON } from "./llm";
import {
  editMemoryRun,
  getMemoryRun,
  memoryAttempt,
  memoryPolicy,
} from "./memory-store";
import {
  buildEvaluatorMessages,
  buildPatcherMessages,
  buildRunnerMessages,
} from "./prompts";
import { readPrismaRun } from "./runs";
import {
  DEFAULT_POLICY,
  EvaluatorOutputSchema,
  PatchOutputSchema,
  type EvaluatorOutput,
  type PatchOutput,
  type Policy,
} from "./schemas";
import {
  simulateEvaluator,
  simulatePatcher,
  simulateRunner,
} from "./simulate";
import {
  EVALUATOR_TEMPERATURE,
  PATCHER_TEMPERATURE,
  RUNNER_TEMPERATURE,
} from "./temperatures";
import type { RunResponse } from "./run-types";

function simulationEnabled(): boolean {
  return usesSimulationClient();
}

async function runRunner(
  attemptIndex: number,
  taskText: string,
  policy: Policy
): Promise<string> {
  if (simulationEnabled()) {
    return simulateRunner(attemptIndex, taskText, policy);
  }
  const messages = buildRunnerMessages(taskText, policy);
  const resp = await chatCompletion(messages, { temperature: RUNNER_TEMPERATURE });
  return resp.content;
}

async function runEvaluator(
  attemptIndex: number,
  taskText: string,
  outputText: string,
  policy: Policy
): Promise<EvaluatorOutput> {
  const raw = simulationEnabled()
    ? await simulateEvaluator(attemptIndex)
    : await chatCompletionJSON<unknown>(
        buildEvaluatorMessages(taskText, outputText, policy),
        { temperature: EVALUATOR_TEMPERATURE }
      );
  return EvaluatorOutputSchema.parse(raw);
}

async function runPatcher(
  attemptIndex: number,
  taskText: string,
  outputText: string,
  evaluation: EvaluatorOutput,
  policy: Policy
): Promise<PatchOutput> {
  const raw = simulationEnabled()
    ? await simulatePatcher(attemptIndex)
    : await chatCompletionJSON<unknown>(
        buildPatcherMessages(taskText, outputText, evaluation, policy),
        { temperature: PATCHER_TEMPERATURE }
      );
  return PatchOutputSchema.parse(raw);
}

async function improve(args: {
  taskText: string;
  maxAttempts: number;
  targetScore: number;
  onInitialPolicy: (policy: Policy) => Promise<void>;
  onAttempt: (attempt: {
    index: number;
    outputText: string;
    scoreTotal: number;
    evaluation: EvaluatorOutput;
  }) => Promise<void>;
  onPolicy: (policy: Policy) => Promise<void>;
}): Promise<void> {
  const initialPolicy: Policy = { ...DEFAULT_POLICY };
  await args.onInitialPolicy(initialPolicy);
  await runImprovementLoop({
    taskText: args.taskText,
    initialPolicy,
    maxAttempts: args.maxAttempts,
    targetScore: args.targetScore,
    client: {
      runner: runRunner,
      evaluator: runEvaluator,
      patcher: runPatcher,
    },
    hooks: {
      onAttempt: async (attempt) => {
        await args.onAttempt(attempt);
      },
      onPolicy: async (policy) => {
        await args.onPolicy(policy);
      },
    },
  });
}

async function executeMemoryRun(runId: string): Promise<RunResponse> {
  const existing = getMemoryRun(runId);
  if (!existing) throw new Error(`Run ${runId} not found`);

  editMemoryRun(runId, (run) => {
    run.attempts = [];
    run.policyVersions = [];
    run.status = "running";
  });

  try {
    await improve({
      taskText: existing.taskText,
      maxAttempts: existing.maxAttempts,
      targetScore: existing.targetScore,
      onInitialPolicy: async (policy) => {
        editMemoryRun(runId, (run) => {
          run.policyVersions.push(memoryPolicy(policy));
        });
      },
      onAttempt: async (attempt) => {
        editMemoryRun(runId, (run) => {
          run.attempts.push(
            memoryAttempt({
              index: attempt.index,
              outputText: attempt.outputText,
              scoreTotal: attempt.scoreTotal,
              scoreBreakdown: attempt.evaluation.score_breakdown as Record<string, number>,
              violations: attempt.evaluation.violations,
              notes: attempt.evaluation.notes,
            })
          );
        });
      },
      onPolicy: async (policy) => {
        editMemoryRun(runId, (run) => {
          run.policyVersions.push(memoryPolicy(policy));
        });
      },
    });
    editMemoryRun(runId, (run) => {
      run.status = "completed";
    });
  } catch (err) {
    editMemoryRun(runId, (run) => {
      run.status = "failed";
    });
    throw err;
  }

  const done = getMemoryRun(runId);
  if (!done) throw new Error("Run not found");
  return attachMode(done);
}

async function executePrismaRun(runId: string): Promise<RunResponse> {
  const run = await prisma.projectRun.findUnique({ where: { id: runId } });
  if (!run) throw new Error(`Run ${runId} not found`);

  await prisma.attempt.deleteMany({ where: { runId } });
  await prisma.policyVersion.deleteMany({ where: { runId } });
  await prisma.projectRun.update({
    where: { id: runId },
    data: { status: "running" },
  });

  try {
    await improve({
      taskText: run.taskText,
      maxAttempts: run.maxAttempts,
      targetScore: run.targetScore,
      onInitialPolicy: async (policy) => {
        await prisma.policyVersion.create({
          data: {
            runId,
            version: 1,
            policyJson: JSON.stringify(policy),
          },
        });
      },
      onAttempt: async (attempt) => {
        await prisma.attempt.create({
          data: {
            runId,
            index: attempt.index,
            outputText: attempt.outputText,
            scoreTotal: attempt.scoreTotal,
            scoreBreakdownJson: JSON.stringify(attempt.evaluation.score_breakdown),
            violationsJson: JSON.stringify({
              violations: attempt.evaluation.violations,
              notes: attempt.evaluation.notes,
            }),
          },
        });
      },
      onPolicy: async (policy) => {
        await prisma.policyVersion.create({
          data: {
            runId,
            version: policy.version,
            policyJson: JSON.stringify(policy),
          },
        });
      },
    });
    await prisma.projectRun.update({
      where: { id: runId },
      data: { status: "completed" },
    });
  } catch (err) {
    await prisma.projectRun.update({
      where: { id: runId },
      data: { status: "failed" },
    });
    throw err;
  }

  const loaded = await readPrismaRun(runId);
  if (!loaded) throw new Error("Run not found");
  return loaded;
}

export async function executeRun(runId: string): Promise<RunResponse> {
  if (usesMemoryStore()) return executeMemoryRun(runId);
  return executePrismaRun(runId);
}

import { prisma } from "./db";
import { runImprovementLoop } from "./improvement-loop";
import { chatCompletion, chatCompletionJSON } from "./llm";
import {
  DEFAULT_POLICY,
  EvaluatorOutputSchema,
  PatchOutputSchema,
  type Policy,
  type EvaluatorOutput,
  type PatchOutput,
} from "./schemas";
import {
  buildRunnerMessages,
  buildEvaluatorMessages,
  buildPatcherMessages,
} from "./prompts";
import {
  simulateRunner,
  simulateEvaluator,
  simulatePatcher,
} from "./simulate";
import {
  EVALUATOR_TEMPERATURE,
  PATCHER_TEMPERATURE,
  RUNNER_TEMPERATURE,
} from "./temperatures";

function isSimulation(): boolean {
  return process.env.USE_SIMULATION === "true";
}

async function runRunner(
  attemptIndex: number,
  taskText: string,
  policy: Policy
): Promise<string> {
  if (isSimulation()) {
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
  const raw = isSimulation()
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
  const raw = isSimulation()
    ? await simulatePatcher(attemptIndex)
    : await chatCompletionJSON<unknown>(
        buildPatcherMessages(taskText, outputText, evaluation, policy),
        { temperature: PATCHER_TEMPERATURE }
      );
  return PatchOutputSchema.parse(raw);
}

export async function executeRun(runId: string) {
  const run = await prisma.projectRun.findUnique({ where: { id: runId } });
  if (!run) throw new Error(`Run ${runId} not found`);

  await prisma.attempt.deleteMany({ where: { runId } });
  await prisma.policyVersion.deleteMany({ where: { runId } });

  await prisma.projectRun.update({
    where: { id: runId },
    data: { status: "running" },
  });

  const initialPolicy: Policy = { ...DEFAULT_POLICY };

  await prisma.policyVersion.create({
    data: {
      runId,
      version: 1,
      policyJson: JSON.stringify(initialPolicy),
    },
  });

  try {
    await runImprovementLoop({
      taskText: run.taskText,
      initialPolicy,
      maxAttempts: run.maxAttempts,
      targetScore: run.targetScore,
      client: {
        runner: runRunner,
        evaluator: runEvaluator,
        patcher: runPatcher,
      },
      hooks: {
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

  return loadRunDetail(runId);
}

async function loadRunDetail(runId: string) {
  const run = await prisma.projectRun.findUnique({
    where: { id: runId },
    include: {
      attempts: { orderBy: { index: "asc" } },
      policyVersions: { orderBy: { version: "asc" } },
    },
  });
  if (!run) throw new Error("Run not found");

  return {
    id: run.id,
    title: run.title,
    taskText: run.taskText,
    maxAttempts: run.maxAttempts,
    targetScore: run.targetScore,
    status: run.status,
    createdAt: run.createdAt.toISOString(),
    attempts: run.attempts.map((a) => {
      const violData = a.violationsJson
        ? JSON.parse(a.violationsJson)
        : null;
      const isWrapped = violData && "violations" in violData;
      return {
        id: a.id,
        index: a.index,
        outputText: a.outputText,
        createdAt: a.createdAt.toISOString(),
        scoreTotal: a.scoreTotal,
        scoreBreakdown: a.scoreBreakdownJson
          ? JSON.parse(a.scoreBreakdownJson)
          : null,
        violations: isWrapped ? violData.violations : violData,
        notes: isWrapped ? violData.notes : null,
      };
    }),
    policyVersions: run.policyVersions.map((p) => ({
      id: p.id,
      version: p.version,
      policy: JSON.parse(p.policyJson),
      createdAt: p.createdAt.toISOString(),
    })),
  };
}

import { prisma } from "./db";
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
import { applyPatch } from "./policy";
import {
  simulateRunner,
  simulateEvaluator,
  simulatePatcher,
} from "./simulate";

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
  const resp = await chatCompletion(messages, { temperature: 0.4 });
  return resp.content;
}

async function runEvaluator(
  attemptIndex: number,
  taskText: string,
  outputText: string,
  policy: Policy
): Promise<EvaluatorOutput> {
  if (isSimulation()) {
    return simulateEvaluator(attemptIndex);
  }
  const messages = buildEvaluatorMessages(taskText, outputText, policy);
  const raw = await chatCompletionJSON<EvaluatorOutput>(messages, {
    temperature: 0.1,
  });
  return EvaluatorOutputSchema.parse(raw);
}

async function runPatcher(
  attemptIndex: number,
  taskText: string,
  outputText: string,
  evaluation: EvaluatorOutput,
  policy: Policy
): Promise<PatchOutput> {
  if (isSimulation()) {
    return simulatePatcher(attemptIndex);
  }
  const messages = buildPatcherMessages(taskText, outputText, evaluation, policy);
  const raw = await chatCompletionJSON<PatchOutput>(messages, {
    temperature: 0.2,
  });
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

  let currentPolicy: Policy = { ...DEFAULT_POLICY };

  await prisma.policyVersion.create({
    data: {
      runId,
      version: 1,
      policyJson: JSON.stringify(currentPolicy),
    },
  });

  try {
    for (let i = 1; i <= run.maxAttempts; i++) {
      const outputText = await runRunner(i, run.taskText, currentPolicy);

      const evaluation = await runEvaluator(
        i,
        run.taskText,
        outputText,
        currentPolicy
      );

      const scoreTotal = Math.round(evaluation.score_total);

      await prisma.attempt.create({
        data: {
          runId,
          index: i,
          outputText,
          scoreTotal,
          scoreBreakdownJson: JSON.stringify(evaluation.score_breakdown),
          violationsJson: JSON.stringify({
            violations: evaluation.violations,
            notes: evaluation.notes,
          }),
        },
      });

      if (scoreTotal >= run.targetScore) {
        await prisma.projectRun.update({
          where: { id: runId },
          data: { status: "completed" },
        });
        return loadRunDetail(runId);
      }

      if (i < run.maxAttempts) {
        const patch = await runPatcher(
          i,
          run.taskText,
          outputText,
          evaluation,
          currentPolicy
        );
        currentPolicy = applyPatch(currentPolicy, patch);

        await prisma.policyVersion.create({
          data: {
            runId,
            version: currentPolicy.version,
            policyJson: JSON.stringify(currentPolicy),
          },
        });
      }
    }

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

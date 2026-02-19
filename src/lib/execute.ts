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

export async function executeRun(runId: string) {
  const run = await prisma.projectRun.findUnique({ where: { id: runId } });
  if (!run) throw new Error(`Run ${runId} not found`);

  await prisma.projectRun.update({
    where: { id: runId },
    data: { status: "running" },
  });

  let currentPolicy: Policy = { ...DEFAULT_POLICY };

  const existingPolicies = await prisma.policyVersion.findMany({
    where: { runId },
    orderBy: { version: "desc" },
    take: 1,
  });

  if (existingPolicies.length > 0) {
    currentPolicy = JSON.parse(existingPolicies[0].policyJson) as Policy;
  } else {
    await prisma.policyVersion.create({
      data: {
        runId,
        version: 1,
        policyJson: JSON.stringify(currentPolicy),
      },
    });
  }

  try {
    for (let i = 1; i <= run.maxAttempts; i++) {
      const runnerMessages = buildRunnerMessages(run.taskText, currentPolicy);
      const runnerResp = await chatCompletion(runnerMessages, {
        temperature: 0.4,
      });
      const outputText = runnerResp.content;

      const evalMessages = buildEvaluatorMessages(
        run.taskText,
        outputText,
        currentPolicy
      );
      const evalRaw = await chatCompletionJSON<EvaluatorOutput>(evalMessages, {
        temperature: 0.1,
      });
      const evaluation = EvaluatorOutputSchema.parse(evalRaw);

      await prisma.attempt.create({
        data: {
          runId,
          index: i,
          outputText,
          scoreTotal: evaluation.score_total,
          scoreBreakdownJson: JSON.stringify(evaluation.score_breakdown),
          violationsJson: JSON.stringify({
            violations: evaluation.violations,
            notes: evaluation.notes,
          }),
        },
      });

      if (evaluation.score_total >= run.targetScore) {
        await prisma.projectRun.update({
          where: { id: runId },
          data: { status: "completed" },
        });
        return loadRunDetail(runId);
      }

      if (i < run.maxAttempts) {
        const patchMessages = buildPatcherMessages(
          run.taskText,
          outputText,
          evaluation,
          currentPolicy
        );
        const patchRaw = await chatCompletionJSON<PatchOutput>(patchMessages, {
          temperature: 0.2,
        });
        const patch = PatchOutputSchema.parse(patchRaw);
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

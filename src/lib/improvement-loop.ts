import { applyPatch } from "./policy";
import { scoreTotalFromBreakdown } from "./score";
import type { EvaluatorOutput, PatchOutput, Policy } from "./schemas";

export interface LoopAttempt {
  index: number;
  outputText: string;
  evaluation: EvaluatorOutput;
  scoreTotal: number;
  /** Policy that produced this attempt, before any patch from it. */
  policy: Policy;
}

export interface HardCheckFailure {
  id: string;
  type: string;
  message: string;
}

export interface PatchContext {
  hardCheckFailures: HardCheckFailure[];
}

export interface AttemptAssessment {
  /** Score compared with the target. The eval harness passes the blended total. */
  total: number;
  hardChecksPass: boolean;
  hardCheckFailures: HardCheckFailure[];
}

export interface ImprovementLoopClient {
  runner: (attemptIndex: number, taskText: string, policy: Policy) => Promise<string>;
  evaluator: (
    attemptIndex: number,
    taskText: string,
    outputText: string,
    policy: Policy
  ) => Promise<EvaluatorOutput>;
  patcher: (
    attemptIndex: number,
    taskText: string,
    outputText: string,
    evaluation: EvaluatorOutput,
    policy: Policy,
    patchContext?: PatchContext
  ) => Promise<PatchOutput>;
}

export interface ImprovementLoopHooks {
  onAttempt?: (attempt: LoopAttempt) => Promise<void>;
  /** Called with each policy produced by the patcher. The initial policy is not included. */
  onPolicy?: (policy: Policy) => Promise<void>;
}

/**
 * The product self-improvement loop: runner, evaluator, then a patch when the
 * attempt should continue and attempts remain.
 * Without `assess`, the compared score is the judge total and hard checks count
 * as passing. That is the app loop. The eval harness passes `assess` so a run
 * stops only when the blended total meets the target and every hard check passes,
 * and so the patcher receives the hard-check failures.
 * Persistence is left to the caller. The eval harness and `executeRun` both
 * use this function.
 */
export async function runImprovementLoop(args: {
  taskText: string;
  initialPolicy: Policy;
  maxAttempts: number;
  targetScore: number;
  client: ImprovementLoopClient;
  hooks?: ImprovementLoopHooks;
  /** First attempt index to run. Earlier attempts were restored by `--resume`. */
  startAttempt?: number;
  assess?: (input: {
    outputText: string;
    evaluation: EvaluatorOutput;
    judgeScore: number;
  }) => AttemptAssessment;
}): Promise<{
  attempts: LoopAttempt[];
  policies: Policy[];
  reachedTarget: boolean;
}> {
  const attempts: LoopAttempt[] = [];
  const policies: Policy[] = [args.initialPolicy];
  let current = args.initialPolicy;
  const start = args.startAttempt ?? 1;

  for (let index = start; index <= args.maxAttempts; index++) {
    const outputText = await args.client.runner(index, args.taskText, current);
    const evaluation = await args.client.evaluator(
      index,
      args.taskText,
      outputText,
      current
    );
    const judgeScore = scoreTotalFromBreakdown(evaluation.score_breakdown);
    const assessment: AttemptAssessment = args.assess
      ? args.assess({ outputText, evaluation, judgeScore })
      : { total: judgeScore, hardChecksPass: true, hardCheckFailures: [] };
    const attempt: LoopAttempt = {
      index,
      outputText,
      evaluation,
      scoreTotal: judgeScore,
      policy: current,
    };
    attempts.push(attempt);
    if (args.hooks?.onAttempt) await args.hooks.onAttempt(attempt);

    if (assessment.total >= args.targetScore && assessment.hardChecksPass) {
      return { attempts, policies, reachedTarget: true };
    }

    if (index < args.maxAttempts) {
      const patch = await args.client.patcher(
        index,
        args.taskText,
        outputText,
        evaluation,
        current,
        { hardCheckFailures: assessment.hardCheckFailures }
      );
      current = applyPatch(current, patch);
      policies.push(current);
      if (args.hooks?.onPolicy) await args.hooks.onPolicy(current);
    }
  }

  return { attempts, policies, reachedTarget: false };
}

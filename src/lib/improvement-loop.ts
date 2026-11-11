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
    policy: Policy
  ) => Promise<PatchOutput>;
}

export interface ImprovementLoopHooks {
  onAttempt?: (attempt: LoopAttempt) => Promise<void>;
  /** Called with each policy produced by the patcher. The initial policy is not included. */
  onPolicy?: (policy: Policy) => Promise<void>;
}

/**
 * The product self-improvement loop: runner, evaluator, then a patch when the
 * judge score is still below the target and attempts remain.
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
}): Promise<{
  attempts: LoopAttempt[];
  policies: Policy[];
  reachedTarget: boolean;
}> {
  const attempts: LoopAttempt[] = [];
  const policies: Policy[] = [args.initialPolicy];
  let current = args.initialPolicy;

  for (let index = 1; index <= args.maxAttempts; index++) {
    const outputText = await args.client.runner(index, args.taskText, current);
    const evaluation = await args.client.evaluator(
      index,
      args.taskText,
      outputText,
      current
    );
    const scoreTotal = scoreTotalFromBreakdown(evaluation.score_breakdown);
    const attempt: LoopAttempt = {
      index,
      outputText,
      evaluation,
      scoreTotal,
      policy: current,
    };
    attempts.push(attempt);
    if (args.hooks?.onAttempt) await args.hooks.onAttempt(attempt);

    if (scoreTotal >= args.targetScore) {
      return { attempts, policies, reachedTarget: true };
    }

    if (index < args.maxAttempts) {
      const patch = await args.client.patcher(
        index,
        args.taskText,
        outputText,
        evaluation,
        current
      );
      current = applyPatch(current, patch);
      policies.push(current);
      if (args.hooks?.onPolicy) await args.hooks.onPolicy(current);
    }
  }

  return { attempts, policies, reachedTarget: false };
}

import type { PatchContext } from "../improvement-loop";
import {
  chatCompletion,
  chatCompletionJSONDetailed,
  emptyUsage,
  type TokenUsage,
} from "../llm";
import {
  buildEvaluatorMessages,
  buildPatcherMessages,
  buildReviserMessages,
  buildRunnerMessages,
} from "../prompts";
import type { EvaluatorOutput, Policy } from "../schemas";
import { simulateEvaluator, simulatePatcher, simulateRunner } from "../simulate";
import {
  EVALUATOR_TEMPERATURE,
  PATCHER_TEMPERATURE,
  RUNNER_TEMPERATURE,
} from "../temperatures";

export interface RoleResult {
  usage?: TokenUsage;
  /** HTTP calls made for this role, including a JSON parse retry. */
  attempts?: number;
}

export interface RoleCallOptions {
  /** Integer seed forwarded to the provider. Omitted when unset. */
  seed?: number;
}

export interface RoleClient {
  runner(
    attemptIndex: number,
    taskText: string,
    policy: Policy,
    options?: RoleCallOptions
  ): Promise<RoleResult & { content: string }>;
  evaluator(
    attemptIndex: number,
    taskText: string,
    outputText: string,
    policy: Policy,
    options?: RoleCallOptions
  ): Promise<RoleResult & { data: unknown }>;
  patcher(
    attemptIndex: number,
    taskText: string,
    outputText: string,
    evaluation: EvaluatorOutput,
    policy: Policy,
    patchContext?: PatchContext,
    options?: RoleCallOptions
  ): Promise<RoleResult & { data: unknown }>;
  /** Optional. Self-Refine falls back to the runner when this is absent. */
  reviser?(
    attemptIndex: number,
    taskText: string,
    previousOutput: string,
    critique: string,
    policy: Policy,
    options?: RoleCallOptions
  ): Promise<RoleResult & { content: string }>;
}

function simulationClient(): RoleClient {
  return {
    async runner(attemptIndex, taskText, policy) {
      return {
        content: await simulateRunner(attemptIndex, taskText, policy),
        usage: emptyUsage(),
        attempts: 1,
      };
    },
    async evaluator(attemptIndex) {
      return {
        data: await simulateEvaluator(attemptIndex),
        usage: emptyUsage(),
        attempts: 1,
      };
    },
    async patcher(attemptIndex) {
      return {
        data: await simulatePatcher(attemptIndex),
        usage: emptyUsage(),
        attempts: 1,
      };
    },
    async reviser(attemptIndex, taskText, _previous, _critique, policy) {
      return {
        content: await simulateRunner(attemptIndex, taskText, policy),
        usage: emptyUsage(),
        attempts: 1,
      };
    },
  };
}

function liveClient(): RoleClient {
  return {
    async runner(_attemptIndex, taskText, policy, options) {
      const response = await chatCompletion(buildRunnerMessages(taskText, policy), {
        temperature: RUNNER_TEMPERATURE,
        seed: options?.seed,
      });
      return { content: response.content, usage: response.usage, attempts: 1 };
    },
    async evaluator(_attemptIndex, taskText, outputText, policy, options) {
      const response = await chatCompletionJSONDetailed(
        buildEvaluatorMessages(taskText, outputText, policy),
        { temperature: EVALUATOR_TEMPERATURE, seed: options?.seed }
      );
      return { data: response.data, usage: response.usage, attempts: response.attempts };
    },
    async patcher(_attemptIndex, taskText, outputText, evaluation, policy, patchContext, options) {
      const response = await chatCompletionJSONDetailed(
        buildPatcherMessages(
          taskText,
          outputText,
          evaluation,
          policy,
          patchContext?.hardCheckFailures
        ),
        { temperature: PATCHER_TEMPERATURE, seed: options?.seed }
      );
      return { data: response.data, usage: response.usage, attempts: response.attempts };
    },
    async reviser(_attemptIndex, taskText, previousOutput, critique, policy, options) {
      const response = await chatCompletion(
        buildReviserMessages(taskText, previousOutput, critique, policy),
        { temperature: RUNNER_TEMPERATURE, seed: options?.seed }
      );
      return { content: response.content, usage: response.usage, attempts: 1 };
    },
  };
}

/**
 * `--dry-run` uses the in-repo simulation client.
 * A live run always calls the OpenAI-compatible API, including when
 * `USE_SIMULATION` is set for the Next.js app.
 */
export function createRoleClient(options: { dryRun: boolean }): RoleClient {
  return options.dryRun ? simulationClient() : liveClient();
}

import type { Policy } from "../schemas";
import type { FIXED_TEMPERATURES } from "../temperatures";
import type { HardCheckReport } from "./checks";

export interface JudgeRecord {
  score: number;
  breakdown: {
    constraint_coverage: number;
    clarity_structure: number;
    tone: number;
    safety: number;
    tool_correctness: number;
  };
  violations: { type: string; message: string; severity: string }[];
  notes: string;
}

export interface AttemptCall {
  role: "runner" | "evaluator" | "patcher";
  latencyMs: number;
  promptTokens: number;
  completionTokens: number;
  cachedTokens: number;
  costUsd: number;
  modelCalls: number;
  usageMissing: boolean;
}

export interface AttemptRecord {
  index: number;
  policyVersion: number;
  outputText: string;
  hardChecks: HardCheckReport;
  judge: JudgeRecord | null;
  total: number | null;
  tokens: { prompt: number; completion: number; cached: number };
  costUsd: number;
  latencyMs: number;
  calls: AttemptCall[];
  error: string | null;
}

export interface TrainingRunRecord {
  run: number;
  reachedTarget: boolean;
  error: string | null;
  finalPolicy: Policy;
  attempts: AttemptRecord[];
}

export interface TrainingTaskRecord {
  id: string;
  title: string;
  prompt: string;
  constraints: string[];
  runs: TrainingRunRecord[];
}

export interface ScoredPass {
  error: string | null;
  attempt: AttemptRecord | null;
}

export interface HeldOutRunRecord {
  run: number;
  initial: ScoredPass;
  learned: ScoredPass;
}

export interface HeldOutTaskRecord {
  id: string;
  title: string;
  prompt: string;
  constraints: string[];
  runs: HeldOutRunRecord[];
}

export interface EvalTotals {
  modelCalls: number;
  promptTokens: number;
  completionTokens: number;
  cachedPromptTokens: number;
  estimatedCostUsd: number;
  callsMissingUsage: number;
}

export interface EvalResults {
  version: 1;
  generatedAt: string;
  dryRun: boolean;
  aborted: boolean;
  abortReason: string | null;
  heldOutSkippedReason: string | null;
  config: {
    model: string;
    temperature: typeof FIXED_TEMPERATURES;
    maxAttempts: number;
    targetScore: number;
    runs: number;
    maxCostUsd: number;
    taskIds: string[];
    totalFormula: string;
    price: {
      model: "gpt-4o-mini";
      inputUsdPerMillion: number;
      cachedInputUsdPerMillion: number;
      outputUsdPerMillion: number;
      source: string;
      checkedOn: string;
      note: string;
    };
  };
  initialPolicy: Policy;
  learnedPolicy: Policy;
  training: TrainingTaskRecord[];
  heldOut: HeldOutTaskRecord[];
  totals: EvalTotals;
}

import type { Policy } from "./schemas";

export const DEMO_MODE_LABEL = "Demo mode: simulated model, not live results";

export interface RunAttempt {
  id: string;
  index: number;
  outputText: string;
  createdAt: string;
  scoreTotal: number | null;
  scoreBreakdown: Record<string, number> | null;
  violations: { type: string; message: string; severity: string }[] | null;
  notes: string | null;
}

export interface RunPolicyVersion {
  id: string;
  version: number;
  policy: Policy;
  createdAt: string;
}

export interface StoredRun {
  id: string;
  title: string;
  taskText: string;
  maxAttempts: number;
  targetScore: number;
  status: string;
  createdAt: string;
  attempts: RunAttempt[];
  policyVersions: RunPolicyVersion[];
}

export interface RunModeFields {
  demoMode: boolean;
  demoLabel: string | null;
  memory: boolean;
}

export interface RunResponse extends StoredRun, RunModeFields {}

export interface RunSummary {
  id: string;
  title: string;
  createdAt: string;
  status: string;
  attemptCount: number;
  bestScore: number | null;
}

export interface RunSeed {
  title: string;
  taskText: string;
  maxAttempts: number;
  targetScore: number;
  createdAt?: string;
}

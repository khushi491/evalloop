import { DEMO_MODE_LABEL } from "./run-types";
import type { RunModeFields } from "./run-types";

const PLACEHOLDER_KEYS = new Set(["sk-placeholder", "sk-your-key-here"]);

export function hasUsableLlmKey(value: string | undefined): boolean {
  if (!value) return false;
  const key = value.trim();
  if (!key) return false;
  return !PLACEHOLDER_KEYS.has(key);
}

export function hasDatabaseUrl(value: string | undefined): boolean {
  return Boolean(value && value.trim());
}

/**
 * Demo mode is the zero-config path: the simulation client plus an in-memory
 * store. It turns on when there is no usable model key and no DATABASE_URL,
 * and on Vercel when either one is missing. Local development that has a
 * database and a usable key stays on Prisma. A placeholder key with
 * USE_SIMULATION=true and DATABASE_URL also stays on Prisma.
 */
export function isDemoMode(env: NodeJS.ProcessEnv = process.env): boolean {
  const key = hasUsableLlmKey(env.OPENAI_API_KEY);
  const database = hasDatabaseUrl(env.DATABASE_URL);
  if (!key && !database) return true;
  if (env.VERCEL === "1" && (!key || !database)) return true;
  return false;
}

/** Skip Prisma when demo mode is on, or whenever there is no database URL. */
export function usesMemoryStore(env: NodeJS.ProcessEnv = process.env): boolean {
  if (isDemoMode(env)) return true;
  return !hasDatabaseUrl(env.DATABASE_URL);
}

export function usesSimulationClient(env: NodeJS.ProcessEnv = process.env): boolean {
  if (isDemoMode(env)) return true;
  return env.USE_SIMULATION === "true";
}

export function runModeFields(env: NodeJS.ProcessEnv = process.env): RunModeFields {
  return {
    demoMode: isDemoMode(env),
    demoLabel: usesSimulationClient(env) ? DEMO_MODE_LABEL : null,
    memory: usesMemoryStore(env),
  };
}

export function attachMode<T extends object>(run: T, env: NodeJS.ProcessEnv = process.env): T & RunModeFields {
  return { ...run, ...runModeFields(env) };
}

export { DEMO_MODE_LABEL };

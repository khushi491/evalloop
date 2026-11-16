import { afterEach, describe, expect, it, vi } from "vitest";
import {
  hasDatabaseUrl,
  hasUsableLlmKey,
  isDemoMode,
  usesMemoryStore,
  usesSimulationClient,
} from "../src/lib/demo-mode";
import { DEMO_MODE_LABEL } from "../src/lib/run-types";
import { createMemoryRun, getMemoryRun, resetMemoryStore } from "../src/lib/memory-store";
import { executeRun } from "../src/lib/execute";

vi.mock("../src/lib/db", () => ({
  prisma: new Proxy(
    {},
    {
      get() {
        throw new Error("prisma should not be used in demo mode");
      },
    }
  ),
}));

const originalFetch = globalThis.fetch.bind(globalThis);

async function withEnv(
  patch: Record<string, string | undefined>,
  run: () => Promise<void>
) {
  const previous = new Map(Object.keys(patch).map((key) => [key, process.env[key]]));
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    await run();
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

describe("demo mode selection", () => {
  it("treats blank and placeholder keys as unusable", () => {
    expect(hasUsableLlmKey(undefined)).toBe(false);
    expect(hasUsableLlmKey("")).toBe(false);
    expect(hasUsableLlmKey("  ")).toBe(false);
    expect(hasUsableLlmKey("sk-placeholder")).toBe(false);
    expect(hasUsableLlmKey("sk-your-key-here")).toBe(false);
    expect(hasUsableLlmKey("ollama")).toBe(true);
    expect(hasDatabaseUrl(undefined)).toBe(false);
    expect(hasDatabaseUrl("  ")).toBe(false);
    expect(hasDatabaseUrl("file:./dev.db")).toBe(true);
  });

  it("turns demo mode on only when the real path is not configured", () => {
    const localKeys = {
      OPENAI_API_KEY: "sk-live-key",
      DATABASE_URL: "file:./dev.db",
      USE_SIMULATION: "false",
    };
    expect(isDemoMode(localKeys)).toBe(false);
    expect(usesMemoryStore(localKeys)).toBe(false);
    expect(usesSimulationClient(localKeys)).toBe(false);

    const localSimulation = {
      OPENAI_API_KEY: "sk-your-key-here",
      DATABASE_URL: "file:./dev.db",
      USE_SIMULATION: "true",
    };
    expect(isDemoMode(localSimulation)).toBe(false);
    expect(usesMemoryStore(localSimulation)).toBe(false);
    expect(usesSimulationClient(localSimulation)).toBe(true);

    const zeroConfig = { USE_SIMULATION: "false" };
    expect(isDemoMode(zeroConfig)).toBe(true);
    expect(usesMemoryStore(zeroConfig)).toBe(true);
    expect(usesSimulationClient(zeroConfig)).toBe(true);

    const vercelBare = { VERCEL: "1", USE_SIMULATION: "false" };
    expect(isDemoMode(vercelBare)).toBe(true);
    expect(usesSimulationClient(vercelBare)).toBe(true);

    const vercelDatabaseOnly = {
      VERCEL: "1",
      DATABASE_URL: "file:./dev.db",
      USE_SIMULATION: "false",
    };
    expect(isDemoMode(vercelDatabaseOnly)).toBe(true);
    expect(usesMemoryStore(vercelDatabaseOnly)).toBe(true);
    expect(usesSimulationClient(vercelDatabaseOnly)).toBe(true);

    const vercelKeyOnly = {
      VERCEL: "1",
      OPENAI_API_KEY: "sk-live-key",
      USE_SIMULATION: "false",
    };
    expect(isDemoMode(vercelKeyOnly)).toBe(true);
    expect(usesSimulationClient(vercelKeyOnly)).toBe(true);

    const vercelReady = {
      VERCEL: "1",
      OPENAI_API_KEY: "sk-live-key",
      DATABASE_URL: "file:./dev.db",
      USE_SIMULATION: "true",
    };
    expect(isDemoMode(vercelReady)).toBe(false);
    expect(usesMemoryStore(vercelReady)).toBe(false);
    expect(usesSimulationClient(vercelReady)).toBe(true);

    const localKeyWithoutDatabase = {
      OPENAI_API_KEY: "sk-live-key",
      USE_SIMULATION: "false",
    };
    expect(isDemoMode(localKeyWithoutDatabase)).toBe(false);
    expect(usesMemoryStore(localKeyWithoutDatabase)).toBe(true);
    expect(usesSimulationClient(localKeyWithoutDatabase)).toBe(false);
  });
});

describe("demo mode execution", () => {
  afterEach(() => {
    resetMemoryStore();
    vi.restoreAllMocks();
  });

  it("runs the simulation client in memory when no key and no database are set", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation((input, init) => {
      const url = String(input instanceof Request ? input.url : input);
      if (/openai|chat\/completions/i.test(url)) {
        return Promise.reject(new Error(`LLM network call attempted: ${url}`));
      }
      return originalFetch(input, init);
    });

    await withEnv(
      {
        OPENAI_API_KEY: undefined,
        DATABASE_URL: undefined,
        USE_SIMULATION: "false",
        VERCEL: undefined,
      },
      async () => {
        expect(isDemoMode()).toBe(true);
        const created = createMemoryRun({
          title: "Demo",
          taskText: "Write a support reply about a duplicate charge.",
          maxAttempts: 5,
          targetScore: 90,
        });
        const id = created.id;
        resetMemoryStore();
        expect(getMemoryRun(id)?.attempts).toEqual([]);

        const result = await executeRun(id);
        expect(result.demoMode).toBe(true);
        expect(result.memory).toBe(true);
        expect(result.demoLabel).toBe(DEMO_MODE_LABEL);
        expect(result.status).toBe("completed");
        expect(result.attempts.map((attempt) => attempt.scoreTotal)).toEqual([52, 72, 84, 92]);
        expect(getMemoryRun(id)?.status).toBe("completed");
      }
    );
  });

  it("stays on the simulation client when Vercel has a database URL but no model key", async () => {
    await withEnv(
      {
        VERCEL: "1",
        OPENAI_API_KEY: undefined,
        USE_SIMULATION: "false",
      },
      async () => {
        expect(isDemoMode()).toBe(true);
        const created = createMemoryRun({
          title: "Vercel",
          taskText: "Write a support reply about a duplicate charge.",
          maxAttempts: 5,
          targetScore: 90,
        });
        const result = await executeRun(created.id);
        expect(result.demoLabel).toBe(DEMO_MODE_LABEL);
        expect(result.attempts.map((attempt) => attempt.scoreTotal)).toEqual([52, 72, 84, 92]);
      }
    );
  });
});

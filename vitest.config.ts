import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import { TEST_DATABASE_URL } from "./tests/test-env";

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    fileParallelism: false,
    maxWorkers: 1,
    pool: "forks",
    testTimeout: 20_000,
    hookTimeout: 60_000,
    globalSetup: ["./tests/global-setup.ts"],
    env: {
      DATABASE_URL: TEST_DATABASE_URL,
      USE_SIMULATION: "true",
      SIMULATION_DELAY_MS: "0",
      OPENAI_API_KEY: "test-not-a-real-key",
      OPENAI_BASE_URL: "http://127.0.0.1:9/v1",
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(root, "src"),
    },
  },
});

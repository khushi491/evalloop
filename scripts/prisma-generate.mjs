import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";

const require = createRequire(import.meta.url);
const prismaCli = require.resolve("prisma/build/index.js");

const env = { ...process.env };
if (!env.DATABASE_URL?.trim()) {
  env.DATABASE_URL = "file:./prisma/dev.db";
}

const result = spawnSync(process.execPath, [prismaCli, "generate"], {
  stdio: "inherit",
  env,
});

if (result.error) {
  console.error(result.error);
  process.exit(1);
}

process.exit(result.status ?? 1);

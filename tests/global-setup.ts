import { execSync } from "node:child_process";
import { repoRoot, TEST_DATABASE_URL } from "./test-env";

export default function setup() {
  const env = { ...process.env, DATABASE_URL: TEST_DATABASE_URL };
  execSync("pnpm exec prisma generate", {
    cwd: repoRoot,
    stdio: "inherit",
    env,
  });
  execSync("pnpm exec prisma migrate deploy", {
    cwd: repoRoot,
    stdio: "inherit",
    env,
  });
}

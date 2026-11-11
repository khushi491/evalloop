import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

export const repoRoot = path.resolve(here, "..");

export const TEST_DATABASE_URL = `file:${path.join(repoRoot, "prisma", "test.db")}`;

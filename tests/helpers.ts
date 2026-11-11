import { prisma } from "../src/lib/db";

export function createRun(options?: {
  title?: string;
  taskText?: string;
  maxAttempts?: number;
  targetScore?: number;
}) {
  return prisma.projectRun.create({
    data: {
      title: options?.title ?? "Test run",
      taskText:
        options?.taskText ??
        "Write a support reply about a duplicate charge.",
      maxAttempts: options?.maxAttempts ?? 5,
      targetScore: options?.targetScore ?? 90,
    },
  });
}

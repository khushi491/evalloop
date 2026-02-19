-- CreateTable
CREATE TABLE "ProjectRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "title" TEXT NOT NULL,
    "taskText" TEXT NOT NULL,
    "maxAttempts" INTEGER NOT NULL DEFAULT 5,
    "targetScore" INTEGER NOT NULL DEFAULT 90,
    "status" TEXT NOT NULL DEFAULT 'pending'
);

-- CreateTable
CREATE TABLE "Attempt" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "runId" TEXT NOT NULL,
    "index" INTEGER NOT NULL,
    "outputText" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "scoreTotal" INTEGER,
    "scoreBreakdownJson" TEXT,
    "violationsJson" TEXT,
    CONSTRAINT "Attempt_runId_fkey" FOREIGN KEY ("runId") REFERENCES "ProjectRun" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PolicyVersion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "runId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "policyJson" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PolicyVersion_runId_fkey" FOREIGN KEY ("runId") REFERENCES "ProjectRun" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Attempt_runId_index_key" ON "Attempt"("runId", "index");

-- CreateIndex
CREATE UNIQUE INDEX "PolicyVersion_runId_version_key" ON "PolicyVersion"("runId", "version");

-- CreateEnum
CREATE TYPE "CronRunStatus" AS ENUM ('RUNNING', 'SUCCESS', 'WARNING', 'FAILED');

-- CreateTable
CREATE TABLE "CronRun" (
    "id" TEXT NOT NULL,
    "job" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "status" "CronRunStatus" NOT NULL DEFAULT 'RUNNING',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "durationMs" INTEGER,
    "summary" JSONB,
    "errorCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CronRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CronRun_job_startedAt_idx" ON "CronRun"("job", "startedAt");

-- CreateIndex
CREATE INDEX "CronRun_status_startedAt_idx" ON "CronRun"("status", "startedAt");

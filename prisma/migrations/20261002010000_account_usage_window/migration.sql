ALTER TABLE "User"
  ADD COLUMN "usageWindowStartedAt" TIMESTAMP(3),
  ADD COLUMN "usageRunCount" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "User" ADD CONSTRAINT "User_usage_state_check"
  CHECK ("usageRunCount" >= 0 AND ("usageWindowStartedAt" IS NOT NULL OR "usageRunCount" = 0));

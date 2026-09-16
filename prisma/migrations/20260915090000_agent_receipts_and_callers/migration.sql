ALTER TABLE "AgentRun" ADD COLUMN "revision" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "AgentRunStep"
  ADD COLUMN "callerTokenId" TEXT,
  ADD COLUMN "receiptRevision" INTEGER,
  ADD COLUMN "accepted" BOOLEAN;
CREATE INDEX "AgentRunStep_callerTokenId_at_idx" ON "AgentRunStep"("callerTokenId", "at");

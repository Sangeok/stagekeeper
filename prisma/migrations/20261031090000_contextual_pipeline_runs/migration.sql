ALTER TABLE "BoardItem" ADD COLUMN "currentRunId" TEXT;
ALTER TABLE "PipelineRun" ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "startedBy" TEXT,
  ADD COLUMN "inputReportId" TEXT;
UPDATE "PipelineRun" SET "createdAt" = "enteredAt";
UPDATE "BoardItem" b SET "currentRunId" = r."id" FROM "PipelineRun" r WHERE r."boardItemId" = b."id";
DROP INDEX "PipelineRun_boardItemId_key";
CREATE UNIQUE INDEX "BoardItem_currentRunId_key" ON "BoardItem"("currentRunId");
CREATE INDEX "PipelineRun_boardItemId_createdAt_idx" ON "PipelineRun"("boardItemId", "createdAt");
ALTER TABLE "BoardItem" ADD CONSTRAINT "BoardItem_currentRunId_fkey" FOREIGN KEY ("currentRunId") REFERENCES "PipelineRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

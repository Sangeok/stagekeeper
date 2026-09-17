-- Additive only: historical graph values and audit rows remain unchanged.
ALTER TABLE "PipelineVersion" ADD COLUMN "format" TEXT;
ALTER TABLE "PipelineRun" ADD COLUMN "entryId" TEXT;
ALTER TABLE "AgentRun" ADD COLUMN "pipelineRunId" TEXT, ADD COLUMN "pipelineEntryId" TEXT;
ALTER TABLE "Report" ADD COLUMN "agentRunId" TEXT;
ALTER TABLE "AgentRun" ADD CONSTRAINT "AgentRun_pipeline_binding_check"
  CHECK (("pipelineRunId" IS NULL) = ("pipelineEntryId" IS NULL));
ALTER TABLE "AgentRun" ADD CONSTRAINT "AgentRun_pipelineRunId_fkey"
  FOREIGN KEY ("pipelineRunId") REFERENCES "PipelineRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Report" ADD CONSTRAINT "Report_agentRunId_fkey"
  FOREIGN KEY ("agentRunId") REFERENCES "AgentRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "AgentRun_pipeline_entry_dispatch_idx"
  ON "AgentRun"("projectId", "pipelineRunId", "pipelineEntryId", "agent", "closedAt");
CREATE INDEX "Report_agentRunId_idx" ON "Report"("agentRunId");

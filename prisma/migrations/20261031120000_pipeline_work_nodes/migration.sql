ALTER TABLE "Project" ADD COLUMN "workPipelineId" TEXT;
ALTER TABLE "Project" ADD COLUMN "workAutomationPaused" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "BoardItem" ADD COLUMN "selectionDecision" JSONB;
ALTER TABLE "PipelineDefinition" ADD COLUMN "selectionPolicy" TEXT;
ALTER TABLE "PipelineVersion" ADD COLUMN "selectionPolicy" TEXT;
CREATE TABLE "PipelineWorkRun" (
  "approvals" JSONB NOT NULL DEFAULT '[]',
  "id" TEXT PRIMARY KEY,
  "projectId" TEXT NOT NULL REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "versionId" TEXT NOT NULL REFERENCES "PipelineVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "node" TEXT NOT NULL,
  "entryId" TEXT NOT NULL,
  "inputKey" TEXT NOT NULL,
  "waitReason" TEXT,
  "assignedBoardItemId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "closedAt" TIMESTAMP(3)
);
CREATE INDEX "PipelineWorkRun_projectId_closedAt_createdAt_idx" ON "PipelineWorkRun"("projectId", "closedAt", "createdAt");
CREATE UNIQUE INDEX "PipelineWorkRun_one_open_per_project" ON "PipelineWorkRun"("projectId") WHERE "closedAt" IS NULL;
ALTER TABLE "AgentRun" ADD COLUMN "workRunId" TEXT REFERENCES "PipelineWorkRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AgentRun" ADD COLUMN "workEntryId" TEXT;
CREATE INDEX "AgentRun_workRunId_workEntryId_idx" ON "AgentRun"("workRunId", "workEntryId");
DO $$
DECLARE project_row RECORD;
DECLARE definition_row RECORD;
DECLARE prefix TEXT[];
DECLARE next_version INTEGER;
BEGIN
  FOR project_row IN SELECT "id", "defaultPipelineId", "autoScoutEnabled", "autoProposeEnabled" FROM "Project" WHERE "defaultPipelineId" IS NOT NULL LOOP
    SELECT * INTO definition_row FROM "PipelineDefinition" WHERE "pipelineId" = project_row."defaultPipelineId" ORDER BY "version" DESC LIMIT 1;
    IF FOUND AND (project_row."autoProposeEnabled" OR project_row."autoScoutEnabled") AND NOT ('assign-work' = ANY(definition_row."steps")) THEN
      prefix := (CASE WHEN project_row."autoScoutEnabled" THEN ARRAY['discover-work'] ELSE ARRAY[]::TEXT[] END)
        || (CASE WHEN project_row."autoProposeEnabled" THEN ARRAY['assign-work'] ELSE ARRAY[]::TEXT[] END);
      INSERT INTO "PipelineDefinition" ("id", "pipelineId", "version", "steps", "gates", "createdBy")
      VALUES ('work-nodes-' || definition_row."id", definition_row."pipelineId", definition_row."version" + 1, prefix || definition_row."steps", definition_row."gates", 'pipeline-work-nodes');
      SELECT COALESCE(MAX("version"), 0) + 1 INTO next_version FROM "PipelineVersion" WHERE "projectId" = project_row."id";
      INSERT INTO "PipelineVersion" ("id", "projectId", "pipelineId", "version", "nodes", "gates", "format", "createdBy")
      SELECT 'work-nodes-' || v."id", v."projectId", v."pipelineId", next_version, prefix || v."nodes", v."gates", 'slots-v1', 'pipeline-work-nodes'
      FROM "PipelineVersion" v WHERE v."pipelineId" = project_row."defaultPipelineId" ORDER BY v."version" DESC LIMIT 1;
    END IF;
  END LOOP;
END $$;

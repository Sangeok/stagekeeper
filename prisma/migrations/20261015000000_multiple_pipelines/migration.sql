-- Additive. Existing PipelineVersion/PipelineRun/TransitionEvent rows keep their values; runs stay pinned to their versions.
ALTER TABLE "Project" ADD COLUMN "autoProposeEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "defaultPipelineId" TEXT;
ALTER TABLE "PipelineVersion" ADD COLUMN "pipelineId" TEXT;

CREATE TABLE "Pipeline" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT NOT NULL,
    "archivedAt" TIMESTAMP(3),
    CONSTRAINT "Pipeline_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "PipelineDefinition" (
    "id" TEXT NOT NULL,
    "pipelineId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "steps" TEXT[],
    "gates" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT NOT NULL,
    CONSTRAINT "PipelineDefinition_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "PipelineRule" (
    "projectId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "pipelineId" TEXT NOT NULL,
    CONSTRAINT "PipelineRule_pkey" PRIMARY KEY ("projectId", "type")
);

CREATE INDEX "Pipeline_projectId_archivedAt_idx" ON "Pipeline"("projectId", "archivedAt");
CREATE UNIQUE INDEX "PipelineDefinition_pipelineId_version_key" ON "PipelineDefinition"("pipelineId", "version");
CREATE INDEX "PipelineVersion_pipelineId_version_idx" ON "PipelineVersion"("pipelineId", "version");

ALTER TABLE "Pipeline" ADD CONSTRAINT "Pipeline_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Project" ADD CONSTRAINT "Project_defaultPipelineId_fkey" FOREIGN KEY ("defaultPipelineId") REFERENCES "Pipeline"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PipelineDefinition" ADD CONSTRAINT "PipelineDefinition_pipelineId_fkey" FOREIGN KEY ("pipelineId") REFERENCES "Pipeline"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PipelineRule" ADD CONSTRAINT "PipelineRule_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PipelineRule" ADD CONSTRAINT "PipelineRule_pipelineId_fkey" FOREIGN KEY ("pipelineId") REFERENCES "Pipeline"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PipelineVersion" ADD CONSTRAINT "PipelineVersion_pipelineId_fkey" FOREIGN KEY ("pipelineId") REFERENCES "Pipeline"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill. Every project gets its Default pipeline (id default_<projectId>, so later lazy creation is idempotent).
-- The latest graph becomes Default's first definition without propose, and propose's presence becomes Automatic picking.
INSERT INTO "Pipeline" ("id", "projectId", "name", "createdBy")
SELECT 'default_' || p."id", p."id", 'Default', 'pipeline' FROM "Project" p
ON CONFLICT ("id") DO NOTHING;
UPDATE "Project" SET "defaultPipelineId" = 'default_' || "id" WHERE "defaultPipelineId" IS NULL;
UPDATE "PipelineVersion" SET "pipelineId" = 'default_' || "projectId" WHERE "pipelineId" IS NULL;
WITH latest AS (
  SELECT DISTINCT ON ("projectId") "projectId", "nodes", "gates", "createdAt", "createdBy"
  FROM "PipelineVersion"
  ORDER BY "projectId", "version" DESC
)
INSERT INTO "PipelineDefinition" ("id", "pipelineId", "version", "steps", "gates", "createdAt", "createdBy")
SELECT 'default_' || l."projectId" || '_1', 'default_' || l."projectId", 1, array_remove(l."nodes", 'propose'), l."gates", l."createdAt", l."createdBy"
FROM latest l
ON CONFLICT ("pipelineId", "version") DO NOTHING;
WITH latest AS (
  SELECT DISTINCT ON ("projectId") "projectId", "nodes"
  FROM "PipelineVersion"
  ORDER BY "projectId", "version" DESC
)
UPDATE "Project" p SET "autoProposeEnabled" = ('propose' = ANY(l."nodes"))
FROM latest l WHERE l."projectId" = p."id";

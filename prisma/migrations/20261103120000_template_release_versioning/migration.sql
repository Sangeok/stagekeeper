ALTER TABLE "AgentRun" ADD COLUMN     "pipelineNode" TEXT,
ADD COLUMN     "templateLanguage" TEXT,
ADD COLUMN     "templatePinOrigin" TEXT,
ADD COLUMN     "templatePinnedAt" TIMESTAMP(3),
ADD COLUMN     "templateReleaseId" TEXT;

ALTER TABLE "PipelineRun" ADD COLUMN     "continuedFromRunId" TEXT,
ADD COLUMN     "legacyEvidence" JSONB,
ADD COLUMN     "sourceWorkRunId" TEXT,
ADD COLUMN     "templateLanguage" TEXT,
ADD COLUMN     "templatePinOrigin" TEXT,
ADD COLUMN     "templatePinnedAt" TIMESTAMP(3),
ADD COLUMN     "templateReleaseId" TEXT;

ALTER TABLE "PipelineWorkRun" ADD COLUMN     "templateLanguage" TEXT,
ADD COLUMN     "templatePinOrigin" TEXT,
ADD COLUMN     "templatePinnedAt" TIMESTAMP(3),
ADD COLUMN     "templateReleaseId" TEXT;

ALTER TABLE "AgentRun" DROP CONSTRAINT "AgentRun_pipeline_binding_check";
ALTER TABLE "AgentRun" ADD CONSTRAINT "AgentRun_pipeline_binding_check" CHECK (
  ("pipelineRunId" IS NULL AND "pipelineEntryId" IS NULL AND "pipelineNode" IS NULL)
  OR ("pipelineRunId" IS NOT NULL AND (
    ("pipelineEntryId" IS NOT NULL AND "pipelineNode" IS NULL)
    OR ("pipelineEntryId" IS NULL AND "pipelineNode" IS NOT NULL AND "templateReleaseId" IS NOT NULL)
  ))
);
ALTER TABLE "AgentRun" ADD CONSTRAINT "AgentRun_work_binding_check" CHECK (
  ("workRunId" IS NULL) = ("workEntryId" IS NULL)
  AND ("workRunId" IS NULL OR "pipelineRunId" IS NULL)
);

CREATE TABLE "TemplateRelease" (
    "id" TEXT NOT NULL,
    "releaseIdentity" TEXT NOT NULL,
    "sourceKey" TEXT NOT NULL,
    "source" JSONB NOT NULL,
    "manifestVersion" INTEGER NOT NULL,
    "manifest" JSONB NOT NULL,
    "contentHash" TEXT NOT NULL,
    "contractHash" TEXT NOT NULL,
    "entryCount" INTEGER NOT NULL,
    "sealedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TemplateRelease_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TemplateReleaseEntry" (
    "releaseId" TEXT NOT NULL,
    "lang" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "body" TEXT NOT NULL,

    CONSTRAINT "TemplateReleaseEntry_pkey" PRIMARY KEY ("releaseId","lang","path")
);

CREATE TABLE "TemplateChannel" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "activeReleaseId" TEXT,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "mode" TEXT NOT NULL DEFAULT 'legacy',
    "legacyWritesBlocked" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "TemplateChannel_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TemplateDeployment" (
    "id" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "inputHash" TEXT NOT NULL,
    "releaseId" TEXT NOT NULL,
    "actor" TEXT NOT NULL,
    "environment" TEXT NOT NULL,
    "targetProfileId" TEXT NOT NULL,
    "targetIdentityHash" TEXT NOT NULL,
    "codeSha" TEXT NOT NULL,
    "workflowRun" TEXT NOT NULL,
    "result" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TemplateDeployment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TemplateRelease_releaseIdentity_key" ON "TemplateRelease"("releaseIdentity");

CREATE INDEX "TemplateRelease_sourceKey_manifestVersion_idx" ON "TemplateRelease"("sourceKey", "manifestVersion");

CREATE UNIQUE INDEX "TemplateDeployment_operation_requestId_key" ON "TemplateDeployment"("operation", "requestId");

ALTER TABLE "TemplateReleaseEntry" ADD CONSTRAINT "TemplateReleaseEntry_releaseId_fkey" FOREIGN KEY ("releaseId") REFERENCES "TemplateRelease"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "TemplateChannel" ADD CONSTRAINT "TemplateChannel_activeReleaseId_fkey" FOREIGN KEY ("activeReleaseId") REFERENCES "TemplateRelease"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "TemplateDeployment" ADD CONSTRAINT "TemplateDeployment_releaseId_fkey" FOREIGN KEY ("releaseId") REFERENCES "TemplateRelease"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "AgentRun" ADD CONSTRAINT "AgentRun_templateReleaseId_fkey" FOREIGN KEY ("templateReleaseId") REFERENCES "TemplateRelease"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PipelineRun" ADD CONSTRAINT "PipelineRun_templateReleaseId_fkey" FOREIGN KEY ("templateReleaseId") REFERENCES "TemplateRelease"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PipelineRun" ADD CONSTRAINT "PipelineRun_sourceWorkRunId_fkey" FOREIGN KEY ("sourceWorkRunId") REFERENCES "PipelineWorkRun"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

ALTER TABLE "PipelineRun" ADD CONSTRAINT "PipelineRun_continuedFromRunId_fkey" FOREIGN KEY ("continuedFromRunId") REFERENCES "PipelineRun"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

ALTER TABLE "PipelineWorkRun" ADD CONSTRAINT "PipelineWorkRun_templateReleaseId_fkey" FOREIGN KEY ("templateReleaseId") REFERENCES "TemplateRelease"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "TemplateChannel" ("id") VALUES ('default');
ALTER TABLE "TemplateChannel" ADD CONSTRAINT "TemplateChannel_state_check" CHECK
  ("id" = 'default' AND "revision" >= 0 AND "mode" IN ('legacy', 'versioned') AND
  ("mode" <> 'versioned' OR ("activeReleaseId" IS NOT NULL AND "legacyWritesBlocked")));
ALTER TABLE "TemplateRelease" ADD CONSTRAINT "TemplateRelease_manifest_check" CHECK
  ("manifestVersion" = 1 AND "entryCount" > 0 AND "contentHash" ~ '^[a-f0-9]{64}$' AND "contractHash" ~ '^[a-f0-9]{64}$');

CREATE FUNCTION protect_template_release() RETURNS trigger LANGUAGE plpgsql SET search_path FROM CURRENT AS $$
BEGIN
  IF OLD."sealedAt" IS NOT NULL THEN
    RAISE EXCEPTION 'Sealed template release is immutable';
  END IF;
  IF TG_OP = 'UPDATE' AND NEW."sealedAt" IS NOT NULL THEN
    IF (SELECT count(*) FROM "TemplateReleaseEntry" WHERE "releaseId" = NEW.id) <> NEW."entryCount" THEN
      RAISE EXCEPTION 'Cannot seal an incomplete template release';
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER template_release_immutable BEFORE UPDATE OR DELETE ON "TemplateRelease"
  FOR EACH ROW EXECUTE FUNCTION protect_template_release();

CREATE FUNCTION protect_template_entry() RETURNS trigger LANGUAGE plpgsql SET search_path FROM CURRENT AS $$
DECLARE target text; sealed timestamp;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW."releaseId" IS DISTINCT FROM OLD."releaseId" THEN
    RAISE EXCEPTION 'Template entry cannot move between releases';
  END IF;
  target := CASE WHEN TG_OP = 'DELETE' THEN OLD."releaseId" ELSE NEW."releaseId" END;
  SELECT "sealedAt" INTO sealed FROM "TemplateRelease" WHERE id = target FOR UPDATE;
  IF NOT FOUND OR sealed IS NOT NULL THEN RAISE EXCEPTION 'Sealed template entries are immutable'; END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER template_entry_immutable BEFORE INSERT OR UPDATE OR DELETE ON "TemplateReleaseEntry"
  FOR EACH ROW EXECUTE FUNCTION protect_template_entry();

CREATE FUNCTION protect_legacy_templates() RETURNS trigger LANGUAGE plpgsql SET search_path FROM CURRENT AS $$
DECLARE blocked boolean;
BEGIN
  SELECT "legacyWritesBlocked" INTO blocked FROM "TemplateChannel" WHERE id = 'default' FOR SHARE;
  IF blocked THEN RAISE EXCEPTION 'Legacy template writes are disabled'; END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER legacy_templates_write_barrier BEFORE INSERT OR UPDATE OR DELETE ON "Template"
  FOR EACH ROW EXECUTE FUNCTION protect_legacy_templates();

CREATE FUNCTION protect_template_channel() RETURNS trigger LANGUAGE plpgsql SET search_path FROM CURRENT AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Template channel cannot be deleted'; END IF;
  IF OLD.mode = 'versioned' AND (NEW.mode <> 'versioned' OR NOT NEW."legacyWritesBlocked") THEN
    RAISE EXCEPTION 'Template cutover cannot be reversed';
  END IF;
  IF NEW."activeReleaseId" IS NOT NULL AND NOT EXISTS
    (SELECT 1 FROM "TemplateRelease" WHERE id = NEW."activeReleaseId" AND "sealedAt" IS NOT NULL) THEN
    RAISE EXCEPTION 'Active template release must be sealed';
  END IF;
  IF NEW."activeReleaseId" IS DISTINCT FROM OLD."activeReleaseId" AND NEW.revision <> OLD.revision + 1 THEN
    RAISE EXCEPTION 'Template activation must advance the revision';
  END IF;
  IF NEW.revision < OLD.revision THEN RAISE EXCEPTION 'Template revision cannot decrease'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER template_channel_guard BEFORE UPDATE OR DELETE ON "TemplateChannel"
  FOR EACH ROW EXECUTE FUNCTION protect_template_channel();

CREATE FUNCTION protect_template_deployment() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Template deployment records are immutable'; END $$;
CREATE TRIGGER template_deployment_immutable BEFORE UPDATE OR DELETE ON "TemplateDeployment"
  FOR EACH ROW EXECUTE FUNCTION protect_template_deployment();

CREATE FUNCTION protect_template_pin() RETURNS trigger LANGUAGE plpgsql SET search_path FROM CURRENT AS $$
DECLARE current_row jsonb; previous_row jsonb; parent jsonb; channel "TemplateChannel"%ROWTYPE;
  project_id text; parent_project text; field text; parent_id text;
BEGIN
  current_row := to_jsonb(NEW);
  IF TG_OP = 'UPDATE' THEN previous_row := to_jsonb(OLD); END IF;
  SELECT * INTO channel FROM "TemplateChannel" WHERE id = 'default';
  IF previous_row->>'templateReleaseId' IS NOT NULL THEN
    FOREACH field IN ARRAY ARRAY['templateReleaseId','templateLanguage','templatePinnedAt','templatePinOrigin','pipelineRunId','pipelineEntryId','pipelineNode','workRunId','workEntryId','sourceWorkRunId','continuedFromRunId'] LOOP
      IF current_row->field IS DISTINCT FROM previous_row->field THEN RAISE EXCEPTION 'Template execution binding is immutable'; END IF;
    END LOOP;
  ELSIF TG_OP = 'UPDATE' AND NEW."templateReleaseId" IS NOT NULL AND NOT (channel.mode = 'legacy' AND channel."legacyWritesBlocked") THEN
    RAISE EXCEPTION 'Historical template pins require bootstrap';
  END IF;
  IF TG_OP = 'UPDATE' AND previous_row->'legacyEvidence' IS DISTINCT FROM current_row->'legacyEvidence'
     AND NOT (previous_row->>'legacyEvidence' IS NULL AND channel.mode = 'legacy' AND channel."legacyWritesBlocked") THEN
    RAISE EXCEPTION 'Cutover evidence is immutable';
  END IF;
  IF TG_OP = 'INSERT' AND current_row->>'legacyEvidence' IS NOT NULL THEN RAISE EXCEPTION 'New runs cannot inherit cutover evidence'; END IF;
  IF NEW."templateReleaseId" IS NULL THEN
    IF NEW."templateLanguage" IS NOT NULL OR NEW."templatePinnedAt" IS NOT NULL OR NEW."templatePinOrigin" IS NOT NULL
      OR (TG_OP = 'INSERT' AND channel.mode = 'versioned') THEN RAISE EXCEPTION 'Complete template selection is required'; END IF;
    RETURN NEW;
  END IF;
  IF NEW."templateLanguage" IS NULL OR NEW."templatePinnedAt" IS NULL OR NEW."templatePinOrigin" NOT IN ('run-start','cutover') OR NEW."templatePinOrigin" IS NULL THEN
    RAISE EXCEPTION 'Complete template selection is required';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM "TemplateRelease" WHERE id = NEW."templateReleaseId" AND "sealedAt" IS NOT NULL AND manifest->'languages' ? NEW."templateLanguage") THEN
    RAISE EXCEPTION 'Pinned template language must belong to a sealed release';
  END IF;
  project_id := current_row->>'projectId';
  IF TG_TABLE_NAME = 'PipelineRun' THEN SELECT "projectId" INTO project_id FROM "BoardItem" WHERE id = NEW."boardItemId"; END IF;
  FOREACH field IN ARRAY ARRAY['pipelineRunId','workRunId','sourceWorkRunId','continuedFromRunId'] LOOP
    parent_id := current_row->>field;
    IF parent_id IS NULL THEN CONTINUE; END IF;
    IF field IN ('workRunId','sourceWorkRunId') THEN
      SELECT to_jsonb(r), r."projectId" INTO parent, parent_project FROM "PipelineWorkRun" r WHERE id = parent_id;
    ELSE
      SELECT to_jsonb(r), b."projectId" INTO parent, parent_project FROM "PipelineRun" r JOIN "BoardItem" b ON b.id = r."boardItemId" WHERE r.id = parent_id;
    END IF;
    IF parent_project IS DISTINCT FROM project_id OR parent->>'templateReleaseId' IS DISTINCT FROM NEW."templateReleaseId"
      OR parent->>'templateLanguage' IS DISTINCT FROM NEW."templateLanguage" THEN RAISE EXCEPTION 'Template parent selection or project does not match'; END IF;
    IF TG_TABLE_NAME = 'AgentRun' AND field = 'pipelineRunId' AND (TG_OP = 'INSERT' OR previous_row->>'pipelineRunId' IS NULL)
      AND EXISTS (SELECT 1 FROM "PipelineRun" r JOIN "PipelineVersion" v ON v.id = r."versionId" WHERE r.id = parent_id AND v.format IS NULL)
      AND (current_row->>'pipelineNode' IS NULL OR current_row->>'pipelineNode' IS DISTINCT FROM parent->>'node') THEN
      RAISE EXCEPTION 'Legacy template execution requires its parent node';
    END IF;
  END LOOP;
  RETURN NEW;
END $$;
CREATE TRIGGER agent_template_pin BEFORE INSERT OR UPDATE ON "AgentRun" FOR EACH ROW EXECUTE FUNCTION protect_template_pin();
CREATE TRIGGER pipeline_template_pin BEFORE INSERT OR UPDATE ON "PipelineRun" FOR EACH ROW EXECUTE FUNCTION protect_template_pin();
CREATE TRIGGER work_template_pin BEFORE INSERT OR UPDATE ON "PipelineWorkRun" FOR EACH ROW EXECUTE FUNCTION protect_template_pin();

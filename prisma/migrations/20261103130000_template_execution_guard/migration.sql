CREATE OR REPLACE FUNCTION protect_template_channel() RETURNS trigger LANGUAGE plpgsql SET search_path FROM CURRENT AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Template channel cannot be deleted'; END IF;
  IF OLD.mode = 'versioned' AND (NEW.mode <> 'versioned' OR NOT NEW."legacyWritesBlocked") THEN
    RAISE EXCEPTION 'Template cutover cannot be reversed';
  END IF;
  IF OLD.mode = 'legacy' AND NEW.mode = 'versioned' AND (
    EXISTS (SELECT 1 FROM "AgentRun" WHERE "closedAt" IS NULL AND "templateReleaseId" IS NULL)
    OR EXISTS (SELECT 1 FROM "PipelineRun" WHERE "closedAt" IS NULL AND "templateReleaseId" IS NULL)
    OR EXISTS (SELECT 1 FROM "PipelineWorkRun" WHERE "closedAt" IS NULL AND "templateReleaseId" IS NULL)
  ) THEN RAISE EXCEPTION 'All open executions must be pinned before template cutover'; END IF;
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

CREATE OR REPLACE FUNCTION protect_template_pin() RETURNS trigger LANGUAGE plpgsql SET search_path FROM CURRENT AS $$
DECLARE current_row jsonb; previous_row jsonb; parent jsonb; channel "TemplateChannel"%ROWTYPE;
  project_id text; parent_project text; field text; parent_id text;
BEGIN
  current_row := to_jsonb(NEW);
  IF TG_OP = 'UPDATE' THEN previous_row := to_jsonb(OLD); END IF;
  SELECT * INTO channel FROM "TemplateChannel" WHERE id = 'default';
  IF channel.mode = 'legacy' THEN
    SELECT * INTO channel FROM "TemplateChannel" WHERE id = 'default' FOR SHARE;
  END IF;
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
      OR (channel.mode = 'versioned' AND (TG_OP = 'INSERT' OR (current_row->>'closedAt' IS NULL AND previous_row->>'closedAt' IS NOT NULL))) THEN RAISE EXCEPTION 'Complete template selection is required'; END IF;
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

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "PipelineVersion" WHERE "pipelineId" IS NULL) THEN
    RAISE EXCEPTION 'old or invalid pipeline writer remains; stop cutover';
  END IF;
END $$;
ALTER TABLE "PipelineVersion" ALTER COLUMN "pipelineId" SET NOT NULL;

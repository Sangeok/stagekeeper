ALTER TABLE "Project" ADD COLUMN "disconnectedAt" TIMESTAMP(3);
ALTER TABLE "ProjectAvailabilityEvent" ADD COLUMN "targetProjectId" TEXT;

ALTER TABLE "Project" ADD CONSTRAINT "Project_disconnected_available_check"
  CHECK ("disconnectedAt" IS NULL OR "available" = false);

CREATE INDEX "Project_ownerUserId_disconnectedAt_idx" ON "Project"("ownerUserId", "disconnectedAt");

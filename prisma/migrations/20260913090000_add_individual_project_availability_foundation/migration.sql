BEGIN;

ALTER TABLE "User" ADD COLUMN "projectAvailabilityVersion" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "Project"
  ADD COLUMN "available" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "lastSelectedAt" TIMESTAMP(3),
  ADD COLUMN "lastSyncedAt" TIMESTAMP(3),
  ADD COLUMN "ownerUserId" TEXT,
  ADD COLUMN "repoOwner" TEXT;

CREATE TABLE "ProjectAvailabilityEvent" (
  "id" TEXT NOT NULL,
  "ownerUserId" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "actor" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "fromPlan" TEXT,
  "toPlan" TEXT,
  "addedProjectIds" TEXT[],
  "removedProjectIds" TEXT[],
  "availableProjectIds" TEXT[],
  "basis" TEXT,
  "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ProjectAvailabilityEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Project_ownerUserId_available_idx" ON "Project"("ownerUserId", "available");
CREATE UNIQUE INDEX "ProjectAvailabilityEvent_ownerUserId_version_key" ON "ProjectAvailabilityEvent"("ownerUserId", "version");
CREATE INDEX "ProjectAvailabilityEvent_ownerUserId_at_idx" ON "ProjectAvailabilityEvent"("ownerUserId", "at");

ALTER TABLE "Project" ADD CONSTRAINT "Project_ownerUserId_fkey"
  FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ProjectAvailabilityEvent" ADD CONSTRAINT "ProjectAvailabilityEvent_ownerUserId_fkey"
  FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

COMMIT;

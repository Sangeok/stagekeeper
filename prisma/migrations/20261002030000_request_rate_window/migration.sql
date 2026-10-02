CREATE TABLE "RequestRateWindow" (
  "scope" TEXT NOT NULL,
  "subjectId" TEXT NOT NULL,
  "ownerUserId" TEXT NOT NULL,
  "projectId" TEXT,
  "startedAt" TIMESTAMP(3) NOT NULL,
  "count" INTEGER NOT NULL,
  CONSTRAINT "RequestRateWindow_pkey" PRIMARY KEY ("scope", "subjectId"),
  CONSTRAINT "RequestRateWindow_subject_check" CHECK (
    ("scope" = 'account' AND "subjectId" = "ownerUserId" AND "projectId" IS NULL) OR
    ("scope" = 'project' AND "projectId" IS NOT NULL AND "subjectId" = "projectId")
  ),
  CONSTRAINT "RequestRateWindow_count_check" CHECK ("count" >= 0),
  CONSTRAINT "RequestRateWindow_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "RequestRateWindow_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "RequestRateWindow_ownerUserId_idx" ON "RequestRateWindow"("ownerUserId");
CREATE INDEX "RequestRateWindow_projectId_idx" ON "RequestRateWindow"("projectId");

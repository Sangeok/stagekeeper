ALTER TABLE "ProjectToken"
  ADD COLUMN "lastUsedAt" TIMESTAMP(3),
  ADD COLUMN "usageTrackingStartedAt" TIMESTAMP(3);

ALTER TABLE "OwnerToken"
  ADD COLUMN "lastUsedAt" TIMESTAMP(3),
  ADD COLUMN "usageTrackingStartedAt" TIMESTAMP(3);

ALTER TABLE "UserToken"
  ADD COLUMN "lastUsedAt" TIMESTAMP(3),
  ADD COLUMN "usageTrackingStartedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "BacklogItem" ADD COLUMN     "addedBy" TEXT NOT NULL DEFAULT 'owner',
ADD COLUMN     "addedByRunId" TEXT,
ADD COLUMN     "removedReason" TEXT,
ADD COLUMN     "type" TEXT,
ADD COLUMN     "typeSetBy" TEXT;

-- Repeat after all old writers are drained, under User then Project locks.
WITH latest AS (
  SELECT DISTINCT ON ("backlogItemId") "backlogItemId", "status"
  FROM "BoardItem"
  WHERE "discardedAt" IS NULL
  ORDER BY "backlogItemId", "proposedOn" DESC
), expected AS (
  SELECT b."id", CASE
    WHEN b."removedAt" IS NULL THEN NULL
    WHEN b."removedReason" = 'discarded' THEN 'discarded'
    WHEN l."status" = 'done' THEN 'done'
    ELSE 'owner'
  END AS reason
  FROM "BacklogItem" b
  LEFT JOIN latest l ON l."backlogItemId" = b."id"
)
UPDATE "BacklogItem" b
SET "removedReason" = e.reason
FROM expected e
WHERE b."id" = e."id" AND b."removedReason" IS DISTINCT FROM e.reason;

-- Backfill. Rows that reached done before acceptedAt existed were accepted by hand (runbook step 7, no server record).
-- Treat them as accepted at their last update, so the turn banner does not list history as pending acceptance.
UPDATE "BoardItem" SET "acceptedAt" = "updatedAt" WHERE "status" = 'done' AND "acceptedAt" IS NULL;

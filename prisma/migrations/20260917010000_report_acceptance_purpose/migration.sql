BEGIN;

ALTER TABLE "Report" ADD COLUMN "isAcceptance" BOOLEAN;

-- Report and its report audit event share PostgreSQL's transaction timestamp.
-- This also recovers acceptance records whose BoardItem was already reopened.
WITH evidence AS (
  SELECT "boardItemId", "at", bool_and("to" = 'done') AS accepts
  FROM "TransitionEvent"
  WHERE "actor" = 'agent' AND "note" = 'report'
    AND "from" = "to" AND "to" IN ('in_review', 'done')
  GROUP BY "boardItemId", "at"
  -- Conflicting purposes at the same timestamp cannot identify an old report.
  HAVING count(DISTINCT "to") = 1
)
UPDATE "Report" AS r
SET "isAcceptance" = e.accepts
FROM evidence AS e
WHERE r."isAcceptance" IS NULL AND r."actor" = 'main-loop'
  AND e."boardItemId" = r."boardItemId" AND e."at" = r."at";

COMMIT;

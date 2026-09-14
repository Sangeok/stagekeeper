BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

LOCK TABLE "AgentRun", "AgentRunStep", "BacklogItem", "BoardItem", "Command",
  "OwnerToken", "PipelineRun", "PipelineVersion", "Project", "ProjectAvailabilityEvent",
  "ProjectMember", "ProjectToken", "Report", "Subscription", "Template", "TransitionEvent",
  "User", "Workspace" IN ACCESS EXCLUSIVE MODE;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "Project" WHERE "ownerUserId" IS NULL OR "repoOwner" IS NULL) THEN
    RAISE EXCEPTION 'D3 cleanup refused: direct owner or repository owner is null';
  END IF;
  IF EXISTS (
    SELECT 1 FROM "ProjectAvailabilityEvent"
    WHERE "addedProjectIds" IS NULL OR "removedProjectIds" IS NULL OR "availableProjectIds" IS NULL
  ) THEN
    RAISE EXCEPTION 'D3 cleanup refused: availability event arrays contain null';
  END IF;
  IF EXISTS (
    SELECT 1 FROM "Project" p
    LEFT JOIN "ProjectMember" m ON m."projectId" = p.id
    GROUP BY p.id, p."ownerUserId", p.owner, p."repoOwner"
    HAVING count(*) FILTER (WHERE m.role = 'owner' AND m."userId" = p."ownerUserId") <> 1
       OR count(*) FILTER (WHERE m.role <> 'owner') <> 0
       OR count(m."userId") <> 1
       OR p.owner <> p."repoOwner"
  ) THEN
    RAISE EXCEPTION 'D3 cleanup refused: legacy ownership shadow differs from direct ownership';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM "User" u
    LEFT JOIN "Subscription" s ON s."userId" = u.id
    LEFT JOIN "Project" p ON p."ownerUserId" = u.id
    GROUP BY u.id, COALESCE(s.plan, 'free')
    HAVING count(p.id) > 0 AND count(p.id) FILTER (WHERE p.available) = 0
       OR COALESCE(s.plan, 'free') = 'free' AND count(p.id) FILTER (WHERE p.available) > 1
       OR COALESCE(s.plan, 'free') = 'pro' AND count(p.id) FILTER (WHERE p.available) > 5
       OR COALESCE(s.plan, 'free') NOT IN ('free', 'pro', 'max') AND count(p.id) FILTER (WHERE p.available) > 1
  ) THEN
    RAISE EXCEPTION 'D3 cleanup refused: stored availability violates the plan invariant';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM "User" u
    LEFT JOIN LATERAL (
      SELECT e.version, e."availableProjectIds"
      FROM "ProjectAvailabilityEvent" e
      WHERE e."ownerUserId" = u.id
      ORDER BY e.version DESC LIMIT 1
    ) latest ON true
    WHERE (latest.version IS NULL AND (u."projectAvailabilityVersion" <> 0 OR EXISTS (SELECT 1 FROM "Project" p WHERE p."ownerUserId" = u.id)))
       OR latest.version IS NOT NULL AND latest.version <> u."projectAvailabilityVersion"
       OR latest.version IS NOT NULL AND latest."availableProjectIds" IS DISTINCT FROM ARRAY(
         SELECT p.id FROM "Project" p WHERE p."ownerUserId" = u.id AND p.available ORDER BY p.id
       )
  ) THEN
    RAISE EXCEPTION 'D3 cleanup refused: availability event does not match the stored set';
  END IF;
END $$;

ALTER TABLE "Project" DROP CONSTRAINT "Project_ownerUserId_fkey";
ALTER TABLE "Project" ALTER COLUMN "ownerUserId" SET NOT NULL;
ALTER TABLE "Project" ALTER COLUMN "repoOwner" SET NOT NULL;
ALTER TABLE "ProjectAvailabilityEvent" ALTER COLUMN "addedProjectIds" SET NOT NULL;
ALTER TABLE "ProjectAvailabilityEvent" ALTER COLUMN "removedProjectIds" SET NOT NULL;
ALTER TABLE "ProjectAvailabilityEvent" ALTER COLUMN "availableProjectIds" SET NOT NULL;
ALTER TABLE "Project" ADD CONSTRAINT "Project_ownerUserId_fkey"
  FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

DROP TABLE "ProjectMember";
ALTER TABLE "Project" DROP COLUMN "owner";

COMMIT;

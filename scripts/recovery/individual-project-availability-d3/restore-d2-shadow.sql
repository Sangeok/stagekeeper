BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

LOCK TABLE "Project", "ProjectAvailabilityEvent", "User" IN ACCESS EXCLUSIVE MODE;

DO $$
BEGIN
  IF to_regclass('"ProjectMember"') IS NOT NULL
     OR EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'Project' AND column_name = 'owner') THEN
    RAISE EXCEPTION 'D3 compensation refused: legacy ownership storage already exists or is partial';
  END IF;
  IF EXISTS (SELECT 1 FROM "Project" WHERE "ownerUserId" IS NULL OR "repoOwner" IS NULL) THEN
    RAISE EXCEPTION 'D3 compensation refused: direct ownership is incomplete';
  END IF;
END $$;

ALTER TABLE "Project" ADD COLUMN "owner" TEXT;
UPDATE "Project" SET "owner" = "repoOwner";
ALTER TABLE "Project" ALTER COLUMN "owner" SET NOT NULL;

CREATE TABLE "ProjectMember" (
  "projectId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "role" TEXT NOT NULL DEFAULT 'owner',
  CONSTRAINT "ProjectMember_pkey" PRIMARY KEY ("projectId", "userId")
);
INSERT INTO "ProjectMember" ("projectId", "userId", "role")
  SELECT id, "ownerUserId", 'owner' FROM "Project";
ALTER TABLE "ProjectMember" ADD CONSTRAINT "ProjectMember_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProjectMember" ADD CONSTRAINT "ProjectMember_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Project" DROP CONSTRAINT "Project_ownerUserId_fkey";
ALTER TABLE "Project" ALTER COLUMN "ownerUserId" DROP NOT NULL;
ALTER TABLE "Project" ALTER COLUMN "repoOwner" DROP NOT NULL;
ALTER TABLE "Project" ADD CONSTRAINT "Project_ownerUserId_fkey"
  FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "Project" p
    LEFT JOIN "ProjectMember" m ON m."projectId" = p.id
    GROUP BY p.id, p."ownerUserId", p.owner, p."repoOwner"
    HAVING count(m.*) <> 1 OR min(m."userId") IS DISTINCT FROM p."ownerUserId"
       OR min(m.role) <> 'owner' OR p.owner IS DISTINCT FROM p."repoOwner"
  ) THEN
    RAISE EXCEPTION 'D3 compensation failed: restored ownership does not match direct ownership';
  END IF;
END $$;

COMMIT;

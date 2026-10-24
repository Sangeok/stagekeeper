BEGIN;

LOCK TABLE "Runner" IN ACCESS EXCLUSIVE MODE;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "Runner"
    WHERE "mode" NOT IN ('session', 'resident')
      OR ("permission" IS NOT NULL AND "permission" NOT IN ('auto', 'allowlist'))
      OR ("mode" = 'resident' AND "branch" IS NULL)
  ) THEN
    RAISE EXCEPTION 'Runner rows do not satisfy the legacy client contract';
  END IF;
END $$;

ALTER TABLE "Runner" ADD COLUMN "client" TEXT NOT NULL DEFAULT 'claude';
ALTER TABLE "Runner" DROP CONSTRAINT "Runner_permission_check";
ALTER TABLE "Runner" ADD CONSTRAINT "Runner_permission_check" CHECK (
  "permission" IS NULL OR "permission" IN ('auto', 'allowlist', 'scoped')
);
ALTER TABLE "Runner" DROP CONSTRAINT "Runner_resident_check";
ALTER TABLE "Runner" ADD CONSTRAINT "Runner_resident_check" CHECK (
  "mode" <> 'resident' OR ("branch" IS NOT NULL AND "permission" IN ('auto', 'allowlist', 'scoped'))
);
ALTER TABLE "Runner" ADD CONSTRAINT "Runner_client_check" CHECK (
  "client" IN ('claude', 'codex')
);
ALTER TABLE "Runner" ADD CONSTRAINT "Runner_client_permission_check" CHECK (
  ("client" = 'claude' AND ("permission" IS NULL OR "permission" IN ('auto', 'allowlist')))
  OR (
    "client" = 'codex'
    AND "mode" = 'resident'
    AND "branch" IS NOT NULL
    AND "permission" IS NOT NULL
    AND "permission" = 'scoped'
    AND NOT "autostart"
  )
);

COMMIT;

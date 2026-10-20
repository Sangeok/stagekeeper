-- 실행기 상태와 lease(프로젝트당 하나), 웹 일시 정지. 추가만 한다 — 옛 서버는 새 테이블과 열을 읽지 않는다.
ALTER TABLE "Project" ADD COLUMN     "runnerPausedAt" TIMESTAMP(3);

CREATE TABLE "Runner" (
    "projectId" TEXT NOT NULL,
    "session" TEXT NOT NULL,
    "tokenId" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "host" TEXT NOT NULL,
    "branch" TEXT,
    "permission" TEXT,
    "autostart" BOOLEAN NOT NULL DEFAULT false,
    "state" TEXT NOT NULL,
    "waitReason" TEXT,
    "lastResult" TEXT,
    "lastLog" TEXT,
    "stopReason" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "seenAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Runner_pkey" PRIMARY KEY ("projectId"),
    -- 값 목록은 packages/core/runner.mjs와 같다.
    CONSTRAINT "Runner_mode_check" CHECK ("mode" IN ('session', 'resident')),
    CONSTRAINT "Runner_state_check" CHECK ("state" IN ('idle', 'working', 'waiting', 'stopped')),
    CONSTRAINT "Runner_wait_check" CHECK (("state" = 'waiting') = ("waitReason" IS NOT NULL) AND ("waitReason" IS NULL OR "waitReason" IN ('dirty', 'branch'))),
    CONSTRAINT "Runner_stop_check" CHECK (("state" = 'stopped') = ("stopReason" IS NOT NULL) AND ("stopReason" IS NULL OR "stopReason" IN ('stuck', 'error', 'plan'))),
    CONSTRAINT "Runner_resident_check" CHECK ("mode" <> 'resident' OR ("branch" IS NOT NULL AND "permission" IN ('auto', 'allowlist'))),
    CONSTRAINT "Runner_permission_check" CHECK ("permission" IS NULL OR "permission" IN ('auto', 'allowlist'))
);

ALTER TABLE "Runner" ADD CONSTRAINT "Runner_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

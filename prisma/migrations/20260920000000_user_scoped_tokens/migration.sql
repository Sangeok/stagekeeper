-- 사용자 단위 토큰(hu_). OwnerToken에서 projectId만 뺀 모양이다 — 프로젝트는 도구 인자로 온다.
-- 순수 additive: 기존 표·열·행을 건드리지 않으므로 코드보다 먼저 가도 뒤에 가도 hs_ 경로는 영향받지 않는다.
BEGIN;

CREATE TABLE "UserToken" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "hash" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "revokedAt" TIMESTAMP(3),

  CONSTRAINT "UserToken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "UserToken_hash_key" ON "UserToken"("hash");
CREATE INDEX "UserToken_userId_idx" ON "UserToken"("userId");

ALTER TABLE "UserToken" ADD CONSTRAINT "UserToken_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

COMMIT;

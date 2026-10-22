-- 자동 시작이 켜진 상주 실행기는 멈춘 뒤에도 행을 남긴다: 소유자 정지는 owner, 로그온 시작 거부는 signin.
-- 둘은 autostart인 resident 행에만 허용한다. 넓히기만 하므로 기존 행은 모두 통과하고 옛 서버도 그대로 쓴다.
ALTER TABLE "Runner" DROP CONSTRAINT "Runner_stop_check";
ALTER TABLE "Runner" ADD CONSTRAINT "Runner_stop_check" CHECK (
    ("state" = 'stopped') = ("stopReason" IS NOT NULL)
    AND ("stopReason" IS NULL OR "stopReason" IN ('stuck', 'error', 'plan', 'owner', 'signin'))
    AND ("stopReason" IS NULL OR "stopReason" NOT IN ('owner', 'signin') OR ("mode" = 'resident' AND "autostart"))
);

// 서비스가 스스로를 부르는 주소 — .env의 HARNESS_PUBLIC_URL(C11). 변수가 없으면 로컬 개발 주소로 떨어진다.
// 프로덕션에서 그 fallback이 쓰이면 모든 토큰 화면이 localhost 주소를 보여 주므로 첫 호출 때 한 번 오류를 남긴다.
// fallback은 그대로 돌려준다 — throw하면 조용한 오설정이 세 토큰 화면의 렌더 실패로 바뀐다(제품 결정 ⑧, 2026-09-23).
// 로그를 모듈 로드가 아니라 첫 호출에 두는 이유: CI의 check 워크플로가 변수 없이 프로덕션 빌드를 돌리고, 빌드는
// 라우트 모듈을 평가한다. 세 라우트는 요청 시 렌더라 첫 호출은 실제 서버에서만 일어난다.
const LOCAL_DEV_URL = "http://localhost:3000";
let reportedMissing = false;

function publicUrl(): string {
  const configured = process.env.HARNESS_PUBLIC_URL;
  if (configured === undefined && process.env.NODE_ENV === "production" && !reportedMissing) {
    reportedMissing = true;
    console.error("HARNESS_PUBLIC_URL is not set; token screens show the local development URL", { fallback: LOCAL_DEV_URL });
  }
  return (configured ?? LOCAL_DEV_URL).replace(/\/$/, "");
}

// 토큰 화면이 보여 주는 주소. 스킬이 서버 주소를 물을 때 사용자가 이 값을 그대로 붙여넣는다 —
// `/api/mcp` 꼬리는 생성기가 뗀다(harness-init.mjs의 normalizeServer). base를 따로 내보내던 serverUrl()은
// 화면의 HARNESS_SERVER 줄과 함께 없앴다: 그 변수는 /harness:init이 직접 설정한다.
export function mcpUrl(): string {
  return `${publicUrl()}/api/mcp`;
}

// 소유자 토큰용 서버. 스킬이 사용자 범위에 `harness_owner`로 등록하는 주소와 같아야 한다 — `${SERVER}/api/mcp/owner`.
export function ownerMcpUrl(): string {
  return `${publicUrl()}/api/mcp/owner`;
}

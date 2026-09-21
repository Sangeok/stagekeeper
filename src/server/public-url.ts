// 서비스가 스스로를 부르는 주소. 기본값을 코드에 박지 않는다(C11) — .env의 HARNESS_PUBLIC_URL을 쓴다.
function publicUrl(): string {
  return (process.env.HARNESS_PUBLIC_URL ?? "http://localhost:3000").replace(/\/$/, "");
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

// 서비스가 스스로를 부르는 주소. 기본값을 코드에 박지 않는다(C11) — .env의 HARNESS_PUBLIC_URL을 쓴다.
function publicUrl(): string {
  return (process.env.HARNESS_PUBLIC_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

// 생성기가 받는 값. 토큰 페이지가 보여 주는 mcpUrl()과 한 출처에서 나오므로 어긋날 수 없다 —
// 사용자가 이 값을 HARNESS_SERVER로 셸에 넣으면 init이 서버 URL을 묻지 않는다.
export function serverUrl(): string {
  return publicUrl();
}

export function mcpUrl(): string {
  return `${publicUrl()}/api/mcp`;
}

// 소유자 토큰용 서버. 스킬이 사용자 범위에 `harness_owner`로 등록하는 주소와 같아야 한다 — `${SERVER}/api/mcp/owner`.
export function ownerMcpUrl(): string {
  return `${publicUrl()}/api/mcp/owner`;
}

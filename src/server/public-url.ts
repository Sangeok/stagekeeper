// 서비스가 스스로를 부르는 주소. 기본값을 코드에 박지 않는다(C11) — .env의 HARNESS_PUBLIC_URL을 쓴다.
function publicUrl(): string {
  return (process.env.HARNESS_PUBLIC_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

export function mcpUrl(): string {
  return `${publicUrl()}/api/mcp`;
}

// 소유자 토큰용 서버. 생성기(--owner)가 .mcp.json에 쓰는 주소와 같아야 한다 — `${SERVER}/api/mcp/owner`.
export function ownerMcpUrl(): string {
  return `${publicUrl()}/api/mcp/owner`;
}

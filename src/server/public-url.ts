// 서비스가 스스로를 부르는 주소. 기본값을 코드에 박지 않는다(C11) — .env의 HARNESS_PUBLIC_URL을 쓴다.
export function publicUrl(): string {
  return (process.env.HARNESS_PUBLIC_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

export function mcpUrl(): string {
  return `${publicUrl()}/api/mcp`;
}

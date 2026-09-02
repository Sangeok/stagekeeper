// 서버 파이프라인과 MCP 도구가 같은 결과 형을 쓴다. 예전에는 pipeline/board.ts의
// BoardResult와 mcp/tools.ts의 ToolResult가 글자 그대로 같은 모양으로 따로 선언돼 있었고,
// deps.ts는 둘이 구조적으로 우연히 맞는다는 사실에만 기대고 있었다 — 한쪽에 필드를 더해도
// 다른 쪽이 따라갈 이유가 없었다.
//
// 화면 쪽 ActionResult(fsd/shared/api/result.ts)와는 일부러 합치지 않는다: 그건 Client
// Component가 읽는 형이고 필드 이름도 다르다(success·data·error).
export type ServerResult<T> = { ok: true; item: T } | { ok: false; reason: string };

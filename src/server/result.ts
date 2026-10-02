// 서버 파이프라인과 MCP 도구가 같은 결과 형을 쓴다.
//
// 화면 쪽 ActionResult(fsd/shared/api/result.ts)와는 일부러 합치지 않는다: 그건 Client
// Component가 읽는 형이고 필드 이름도 다르다(success·data·error).
export type ServerResult<T> = { ok: true; item: T } | { ok: false; reason: string };

// 프로젝트 스코프 거부 문구의 코드 쪽 단일 출처. 사양의 단일 출처는 product-copy.md §12다 —
// 구현자가 새 문장을 지어내지 않도록 두 문장을 여기 한 곳에 둔다.
//
// MCP 도구(mcp/tools.ts)와 REST 세 경로(rest-scope.ts)가 같은 판정을 하므로 같은 문장을 쓴다.
// 문장이 갈리면 같은 거절이 창구마다 달리 읽힌다.
export const NOT_YOURS = "not the owner of this project";

// 슬러그가 아예 없는 옛 harness.json이 이 오류의 주된 원인이다(A-8) — 고치는 법을 문장에 담는다.
// hu_ 사용자에게 전환 경로를 알려 주는 유일한 런타임 창구다.
export const PROJECT_REQUIRED =
  "project required: add project.slug to harness.json (rerun /harness:init once to write it)";

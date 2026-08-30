// 폼 액션의 반환 형. Client Component가 *.server를 import할 수 없어서 model에 둔다(fsd.md).
export type BacklogFormState = { error?: string; done?: boolean };

// 백로그 항목 key 형식 — 프로젝트 안에서 유일해야 한다.
export const BACKLOG_KEY_RE = /^[A-Z]+-\d+$/;

// 증거 작성 규칙(protocol.md). 폼 도움말과 같은 문구를 쓴다.
export const SOURCE_HELP = "Split it in two: what you observed, and what you confirmed in the code.";

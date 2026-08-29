// 폼 액션의 반환 형. Client Component가 *.server를 import할 수 없어서 model에 둔다(fsd.md).
export type BacklogFormState = { error?: string; done?: boolean };

// 백로그 항목 key 형식 — 프로젝트 안에서 유일해야 한다.
export const BACKLOG_KEY_RE = /^[A-Z]+-\d+$/;

// ApcH TASK_BACKLOG.md 머리말의 작성 규칙. 폼 도움말과 같은 문구를 쓴다.
export const SOURCE_HELP =
  "증거에는 관측(무엇이 보였나)과 진단(코드 확정)(어디가 원인인가)을 나눠 적는다.";

// 폼 액션의 반환 형. Client Component가 *.server를 import할 수 없어서 model에 둔다(fsd.md).
// done 채널은 두지 않는다 — 생산자가 채우고 아무도 읽지 않으면, 타입을 읽는 사람은 화면이
// 성공에 반응한다고 오해한다. 성공 후 폼을 비우는 건 UX 결정이라 별도 건으로 남긴다.
export type BacklogFormState = { error?: string };

// 액션 계약도 여기 둔다 — 소비처마다 손으로 베끼면 형이 바뀌어도 컴파일이 통과한다.
export type BacklogFormAction = (prev: BacklogFormState, form: FormData) => Promise<BacklogFormState>;
export type RemoveBacklogAction = (key: string) => Promise<BacklogFormState>;

// 백로그 항목 key 형식 — 프로젝트 안에서 유일해야 한다.
export const BACKLOG_KEY_RE = /^[A-Z]+-\d+$/;

// 증거 작성 규칙(protocol.md). 폼 도움말과 같은 문구를 쓴다.
export const SOURCE_HELP = "Split it in two: what you observed, and what you confirmed in the code.";

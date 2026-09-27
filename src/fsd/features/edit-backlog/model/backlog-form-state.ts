// 폼 액션의 반환 형. Client Component가 *.server를 import할 수 없어서 model에 둔다(fsd.md).
// 판별 유니온이다 — create-project-state.ts와 같은 모양. 필드 부재로 성공을 표현하면 payload를 실을 수 없고
// 오류와 성공이 타입상 구분되지 않는다. idle은 useActionState의 초기값이다.
// 추가 폼은 저장 때만 비우고 오류 때는 draft를 보존한다.
export type BacklogFormState = { status: "idle" } | { status: "saved" } | { status: "error"; error: string };

export const IDLE: BacklogFormState = { status: "idle" };

// 액션 계약도 여기 둔다 — 소비처마다 손으로 베끼면 형이 바뀌어도 컴파일이 통과한다.
export type BacklogFormAction = (prev: BacklogFormState, form: FormData) => Promise<BacklogFormState>;
export type RemoveBacklogAction = (key: string) => Promise<BacklogFormState>;

// 사람용 안내. Scout의 증거 형식은 템플릿과 protocol.md가 정의한다.
export const SOURCE_HELP = "What you want and why. Leave the code to the agents.";

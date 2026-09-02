// 액션의 반환 형. Client Component가 *.server를 import할 수 없어서 model에 둔다(fsd.md 「Server와 Client 경계」).
//
// 판별 유니온인 이유: 세 필드를 각각 optional로 두면 error와 slug·token이 동시에 채워진 상태가
// 타입상 가능하다. 화면은 성공을 먼저 검사하므로 그 조합이 오면 오류를 버리고 성공 화면을
// 그린다 — 생산자가 그런 값을 만들 일이 생겨도 컴파일러는 아무 말도 하지 않는다.
export type CreateProjectState =
  | { status: "idle" }
  | { status: "error"; error: string }
  | { status: "created"; slug: string; token: string };

export const IDLE: CreateProjectState = { status: "idle" };

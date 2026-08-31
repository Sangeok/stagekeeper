// slug 규칙의 유일한 출처. 서버 액션·slug 생성·폼 도움말이 같은 값을 본다 —
// 따로 적어두면 규칙을 바꿨을 때 제출한 뒤에야 어긋난 것을 알게 된다.
export const SLUG_MAX = 40;
export const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,39}$/;

// `/p/new`는 정적 라우트라 `/p/[slug]`보다 먼저 잡힌다 — slug "new"인 프로젝트는 열 수 없다.
// src/app/(app)/p/ 아래 정적 라우트가 늘면 여기에 함께 더한다.
export const RESERVED_SLUGS = new Set(["new"]);

export const SLUG_HINT = `Becomes /p/<slug>. Lowercase letters, numbers, and dashes, 2–${SLUG_MAX} characters.`;
export const SLUG_ERROR = `Slug must be 2–${SLUG_MAX} lowercase letters, numbers, or dashes.`;

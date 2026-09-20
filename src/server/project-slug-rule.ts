// 에이전트 등록(POST /api/projects)이 슬러그를 스스로 만들 때 쓰는 규칙. 순수 함수다.
//
// **왜 packages/core가 아닌가.** 거기에 .mjs를 더하면 scripts/plugin-lib.mjs가 plugin/lib로
// 미러해 플러그인 배포물이 커진다. 생성기는 슬러그를 만들 일이 없다 — 서버가 만들어 돌려준다.
//
// **왜 create-project의 model/project-slug.ts를 재사용하지 않는가.** src/server는 FSD를
// import할 수 없다(verify-fsd-boundaries.mjs의 server/no-fsd-import). 그래서 값이 두 벌이 된다.
// 규칙을 바꿀 때는 **두 곳을 함께** 고쳐야 한다: 여기와 src/fsd/features/create-project/model/project-slug.ts.
// 아래 상수는 그 파일과 같은 값이어야 하며, 다르면 웹 폼이 받는 슬러그와 에이전트가 만드는
// 슬러그가 갈린다.
export const SLUG_MAX = 40;
export const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,39}$/;

// `/p/new`는 정적 라우트라 `/p/[slug]`보다 먼저 잡힌다 — slug "new"인 프로젝트는 열 수 없다.
export const RESERVED_SLUGS = new Set(["new"]);

// GitHub 계정·저장소 이름에 허용되는 모양. 점으로 끝나는 이름은 받지 않는다.
// **src/fsd/features/create-project/model/repo-url.ts의 SEGMENT와 같은 값이어야 한다** —
// src/server가 FSD를 import할 수 없어 여기에 한 벌 더 둔다(위 SLUG_RE와 같은 사정).
export const REPO_SEGMENT = /^[A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9_-])?$/;

// repo 이름 → 슬러그 후보. 규칙에 안 맞는 문자는 대시로 접고, 연속 대시와 양끝 대시를 없앤다.
// 결과가 규칙을 만족하지 않으면(빈 문자열, 한 글자, 예약어) null이다 — 호출부가 접미사로 푼다.
export function slugCandidate(repo: string): string | null {
  const folded = repo
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, SLUG_MAX);
  return SLUG_RE.test(folded) && !RESERVED_SLUGS.has(folded) ? folded : null;
}

// 이미 쓰인 슬러그를 피해 하나를 고른다. taken은 **그 사용자의 것만이 아니라** 전역이어야 한다 —
// Project.slug는 전역 유니크다(schema.prisma).
//
// 접미사는 **다른 저장소가 같은 이름일 때만** 쓰인다. 같은 저장소의 재등록은 호출부의 멱등 조회가
// 먼저 잡으므로 여기까지 오지 않는다 — 그 구분이 무너지면 init 재실행이 <repo>-2를 만든다.
export function availableSlug(repo: string, taken: ReadonlySet<string>, fallback = "project"): string {
  const base = slugCandidate(repo) ?? fallback;
  if (!taken.has(base)) return base;
  for (let n = 2; n < 1000; n += 1) {
    const suffixed = `${base.slice(0, SLUG_MAX - String(n).length - 1)}-${n}`;
    if (!taken.has(suffixed)) return suffixed;
  }
  throw new Error(`could not derive a free slug for ${repo}`);
}

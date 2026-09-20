// 순수. git remote 주소에서 owner·repo만 뽑는다. 서비스는 GitHub에 접속하지 않으므로
// 검증이 아니라 **형식 해석**이다 — 실재 여부는 확인하지 않는다.
//
// 여기 두는 이유: 생성기(plugin/bin/harness-init.mjs)가 `git remote get-url origin`을 읽어
// 등록 호출을 만들어야 하고, 생성기는 plugin/lib 미러만 볼 수 있다. 슬러그 규칙을 core에 두지
// 않은 것과 반대 판단인데 이유가 다르다 — 슬러그는 서버가 만들어 돌려주므로 생성기가 쓸 일이 없다.
//
// **src/fsd/features/create-project/model/repo-url.ts에 같은 정규식이 한 벌 더 있다.**
// 웹 폼의 붙여넣기 경로가 그것을 쓴다. 이번 변경에서 통합하지 않았으므로(범위 밖 리팩터),
// 패턴을 고칠 때는 두 곳을 함께 본다.

// GitHub 계정·저장소 이름에 허용되는 모양. 점으로 끝나는 이름은 받지 않는다.
export const SEGMENT = /^[A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9_-])?$/;

// 각 패턴은 1번이 owner, 2번이 repo다.
const PATTERNS = [
  // git@github.com:owner/repo.git
  /^git@github\.com:([^/]+)\/([^/]+?)(?:\.git)?\/?$/i,
  // https://github.com/owner/repo[/tree/main…]
  /^(?:https?:\/\/)?(?:www\.)?github\.com\/([^/]+)\/([^/]+?)(?:\.git)?(?:\/.*)?$/i,
  // owner/repo — 호스트 없는 짧은 형태. owner에 점을 허용하지 않아 다른 호스트와 갈린다.
  /^([^/\s.]+)\/([^/\s]+?)(?:\.git)?\/?$/,
];

export function parseRepoUrl(input) {
  if (typeof input !== "string") return null;
  const text = input.trim().replace(/[?#].*$/, "");
  if (text === "") return null;
  for (const pattern of PATTERNS) {
    const match = pattern.exec(text);
    const owner = match?.[1];
    const repo = match?.[2];
    if (owner && repo && SEGMENT.test(owner) && SEGMENT.test(repo)) return { owner, repo };
  }
  return null;
}

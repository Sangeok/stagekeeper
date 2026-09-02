import "server-only";

export type PublicRepo = { name: string; defaultBranch: string };

// 로그인한 계정의 **공개** 저장소 목록. 미인증 엔드포인트라 토큰도 스코프도 쓰지 않는다.
// 비공개 저장소는 여기 없다 — 그걸 보려면 repo 스코프(읽기 + 쓰기)가 필요해서
// 저장소 단위로 권한을 주는 GitHub App(Phase 4)까지 미룬다. 그때까지는 주소 붙여넣기가 대안이다.
// 저장소 "내용"은 읽지 않는다. 이름과 기본 브랜치뿐이다.
export async function listPublicRepos(login: string): Promise<PublicRepo[]> {
  try {
    const response = await fetch(
      `https://api.github.com/users/${encodeURIComponent(login)}/repos?sort=updated&per_page=100`,
      {
        headers: { Accept: "application/vnd.github+json" },
        // 미인증 한도가 IP당 시간당 60회다. 목록은 자주 바뀌지 않으므로 5분 캐시로 충분히 아낀다.
        next: { revalidate: 300 },
      },
    );
    if (!response.ok) return [];
    const body: unknown = await response.json();
    if (!Array.isArray(body)) return [];
    const repos: PublicRepo[] = [];
    for (const raw of body) {
      const item = raw as { name?: unknown; default_branch?: unknown; archived?: unknown };
      if (typeof item.name !== "string" || item.archived === true) continue;
      repos.push({
        name: item.name,
        defaultBranch: typeof item.default_branch === "string" ? item.default_branch : "main",
      });
    }
    return repos;
  } catch (error) {
    // 목록은 편의 기능이다. GitHub가 답하지 않아도 붙여넣기로 등록할 수 있어야 한다.
    // 다만 조용히 삼키지는 않는다 — 장애나 rate-limit이면 화면은 "Couldn't load your
    // repositories."만 말하고, 그 이유는 로그에만 남는다(error.tsx들과 같은 규칙).
    console.error(error);
    return [];
  }
}

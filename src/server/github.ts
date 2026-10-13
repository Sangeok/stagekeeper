import "server-only";
import { z } from "zod";

export type PublicRepo = { name: string; defaultBranch: string };
export type PublicReposResult = { ok: true; repos: PublicRepo[] } | { ok: false; category: "http" | "shape" | "request" };

// GitHub 응답 중 읽는 필드만 선언한다. 나머지는 버린다.
// 기본 브랜치나 보관 여부가 없거나 타입이 다르면 "main"과 false로 본다.
const githubRepoSchema = z.object({
  name: z.string(),
  default_branch: z.string().catch("main"),
  archived: z.boolean().catch(false),
});

// 로그인한 계정의 **공개** 저장소 목록. 미인증 엔드포인트라 토큰도 스코프도 쓰지 않는다.
// 비공개 저장소는 여기 없다 — 그걸 보려면 repo 스코프(읽기 + 쓰기)가 필요해서
// 저장소 단위로 권한을 주는 GitHub App(Phase 4)까지 미룬다. 그때까지는 주소 붙여넣기가 대안이다.
// 저장소 "내용"은 읽지 않는다. 이름과 기본 브랜치뿐이다.
export async function listPublicRepos(login: string): Promise<PublicReposResult> {
  try {
    const response = await fetch(
      `https://api.github.com/users/${encodeURIComponent(login)}/repos?sort=updated&per_page=100`,
      {
        headers: {
          Accept: "application/vnd.github+json",
          // 응답 모양에 의존하므로 버전을 고정한다. 그 버전이 종료되면 조용히 다음 버전으로
          // 넘어가지 않고 요청이 실패해 "http"로 드러난다.
          "X-GitHub-Api-Version": "2022-11-28",
        },
        // 미인증 한도가 IP당 시간당 60회다. 목록은 자주 바뀌지 않으므로 5분 캐시로 충분히 아낀다.
        next: { revalidate: 300 },
      },
    );
    if (!response.ok) {
      console.error("github repositories unavailable", { category: "http", status: response.status });
      return { ok: false, category: "http" };
    }
    // 200이어도 본문이 JSON이 아닐 수 있다(프록시 오류 페이지 등). 요청 실패가 아니라 모양 문제다.
    const body: unknown = await response.json().catch(() => null);
    if (!Array.isArray(body)) {
      console.error("github repositories unavailable", { category: "shape" });
      return { ok: false, category: "shape" };
    }
    const repos = body.flatMap((raw): PublicRepo[] => {
      const parsed = githubRepoSchema.safeParse(raw);
      if (!parsed.success || parsed.data.archived) return [];
      return [{ name: parsed.data.name, defaultBranch: parsed.data.default_branch }];
    });
    return { ok: true, repos };
  } catch (error) {
    // 목록은 편의 기능이다. GitHub가 답하지 않아도 붙여넣기로 등록할 수 있어야 한다.
    // 다만 조용히 삼키지는 않는다 — 장애나 rate-limit이면 화면은 "Couldn't load your
    // repositories."만 말하고, 그 이유는 로그에만 남는다(error.tsx들과 같은 규칙).
    console.error("github repositories unavailable", { category: "request", error });
    return { ok: false, category: "request" };
  }
}

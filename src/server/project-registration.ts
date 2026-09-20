// POST /api/projects — 에이전트가 hu_로 프로젝트를 등록한다. DB 연결은 서버 전용으로 유지하고
// 순수 판정은 project-registration-query.ts(트랜잭션 안)와 project-slug-rule.ts(순수)에 있다.
//
// 웹 폼(create-project.server.ts)과 **같은 트랜잭션 함수**를 쓴다 — 상한 판정을 여기서 새로
// 구현하지 않는다. 다른 점은 셋이다: hu_ 인증, 슬러그 자동 파생, 그리고 멱등(같은 저장소
// 재등록은 기존 행을 돌려준다).
import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/server/db";
import { repositoryOwner } from "@/server/project-access-query";
import { AvailabilityConflict, withAvailabilityTransaction } from "@/server/project-availability-service";
import { registerProjectResultIn } from "./project-registration-query";
import { REPO_SEGMENT } from "./project-slug-rule";
import { resolveUserScope } from "./rest-scope";
import { findUserTokenByHash } from "./user-scope-query";

// 응답 모양을 GET /api/project와 **같게** 맞춘다. 생성기가 --register와 --print-project의
// 출력을 한 경로로 다룰 수 있어야 스킬의 초안 작성이 갈라지지 않는다. slug만 돌려주면
// 생성기가 git에서 읽은 값과 서버 값을 반씩 섞게 되어, 웹에서 이름을 바꾼 프로젝트가 어긋난다.
export type RegisterProjectResponse =
  | { ok: true; created: boolean; project: { owner: string; repo: string; branch: string; name: string; slug: string } }
  | { ok: false; status: 400 | 401 | 403 | 409; reason: string };

const field = (body: unknown, key: string): string | null => {
  if (typeof body !== "object" || body === null) return null;
  const value = (body as Record<string, unknown>)[key];
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
};

export async function registerProject(
  authorizationHeader: string | null,
  body: unknown,
): Promise<RegisterProjectResponse> {
  // hu_만 통과한다. hs_로 새 프로젝트를 만드는 것은 말이 안 되므로 여기서 401이다.
  const scope = await resolveUserScope(findUserTokenByHash, authorizationHeader);
  if (!scope.ok) return scope;

  const owner = field(body, "owner");
  const repo = field(body, "repo");
  // branch는 형식을 재지 않는다 — git 브랜치 이름은 `release/1.0`처럼 슬래시를 담을 수 있어
  // SEGMENT로 재면 정상 브랜치를 막는다(create-project.server.ts:26-27과 같은 판단).
  const branch = field(body, "branch") ?? "main";
  if (!owner || !repo) return { ok: false, status: 400, reason: "owner and repo are required" };
  if (!REPO_SEGMENT.test(owner) || !REPO_SEGMENT.test(repo)) {
    return { ok: false, status: 400, reason: "owner and repo must be GitHub names — letters, numbers, dots, dashes, underscores" };
  }

  const input = {
    userId: scope.userId,
    owner,
    repo,
    branch,
    name: field(body, "name") ?? undefined,
    slug: field(body, "slug") ?? undefined,
  };

  // P2002는 여기까지 오면 안 된다 — 슬러그를 트랜잭션 안에서 고르기 때문이다. 그래도 났다면
  // 그 사이에 남이 그 슬러그를 채간 것이므로, **기존 행을 돌려주지 않고** 한 번 더 돌린다:
  // 재시도의 멱등 조회가 내 프로젝트를 찾으면 그것을, 아니면 다음 접미사를 고른다.
  for (let attempt = 0; ; attempt += 1) {
    try {
      const result = await withAvailabilityTransaction(prisma, (tx) => registerProjectResultIn(tx, input));
      if (result.status === "capped") return { ok: false, status: 403, reason: result.reason };
      // 트랜잭션 밖의 읽기 하나. branch는 OWNED_PROJECT_SELECT에 없어 스냅샷에서 꺼낼 수 없다.
      const row = await prisma.project.findUnique({
        where: { id: result.projectId },
        select: { repoOwner: true, repo: true, branch: true, name: true, slug: true },
      });
      if (!row) return { ok: false, status: 409, reason: "the project vanished while registering — try again" };
      return {
        ok: true,
        created: result.status === "created",
        project: { owner: repositoryOwner(row.repoOwner), repo: row.repo, branch: row.branch, name: row.name, slug: row.slug },
      };
    } catch (error) {
      if (error instanceof AvailabilityConflict) return { ok: false, status: 409, reason: error.message };
      const collided = error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002"
        && JSON.stringify(error.meta?.target ?? "").includes("slug");
      if (!collided || attempt === 1) throw error;
    }
  }
}

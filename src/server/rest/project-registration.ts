// POST /api/projects — 에이전트가 hu_로 프로젝트를 등록한다. DB 연결은 서버 전용으로 유지하고
// 순수 판정은 projects/registration-command.ts(트랜잭션 안)와 projects/slug-rule.ts(순수)에 있다.
//
// 웹 폼(create-project.server.ts)과 **같은 트랜잭션 함수**를 쓴다 — 상한 판정을 여기서 새로
// 구현하지 않는다. 다른 점은 셋이다: hu_ 인증, 슬러그 자동 파생, 그리고 멱등(같은 저장소
// 재등록은 기존 행을 돌려준다).
import "server-only";
import { recordTokenUsage } from "@/server/tokens/api.server";
import { limitAccountRequest } from "@/server/usage/api.server";
import type { RestRateFailure } from "./response";
import { prisma } from "@/server/db";
import { registerRepositoryProject, REPO_SEGMENT, RESERVED_SLUGS, SLUG_RE } from "@/server/projects/api";
import { resolveUserScope } from "./scope";
import { findUserTokenByHash } from "@/server/tokens/api.server";

// 응답 모양을 GET /api/project와 **같게** 맞춘다. 생성기가 --register와 --print-project의
// 출력을 한 경로로 다룰 수 있어야 스킬의 초안 작성이 갈라지지 않는다. slug만 돌려주면
// 생성기가 git에서 읽은 값과 서버 값을 반씩 섞게 되어, 웹에서 이름을 바꾼 프로젝트가 어긋난다.
export type RegisterProjectResponse =
  | { ok: true; created: boolean; project: { owner: string; repo: string; branch: string; name: string; slug: string } }
  | { ok: false; status: 400 | 401 | 403 | 409; reason: string; reconnectSlug?: string } | (RestRateFailure & { reconnectSlug?: never });

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
  const scope = await resolveUserScope(findUserTokenByHash, authorizationHeader, recordTokenUsage);
  if (!scope.ok) return scope;
  const limited = await limitAccountRequest(scope.userId);
  if (limited) return { ...limited, status: 429 };

  const owner = field(body, "owner");
  const repo = field(body, "repo");
  // branch는 형식을 재지 않는다 — git 브랜치 이름은 `release/1.0`처럼 슬래시를 담을 수 있어
  // SEGMENT로 재면 정상 브랜치를 막는다(create-project.server.ts의 branch 판단과 같은 판단).
  const branch = field(body, "branch") ?? "main";
  if (!owner || !repo) return { ok: false, status: 400, reason: "owner and repo are required" };
  if (!REPO_SEGMENT.test(owner) || !REPO_SEGMENT.test(repo)) {
    return { ok: false, status: 400, reason: "owner and repo must be GitHub names — letters, numbers, dots, dashes, underscores" };
  }

  const slug = field(body, "slug") ?? undefined;
  if (slug !== undefined && (!SLUG_RE.test(slug) || RESERVED_SLUGS.has(slug))) {
    return { ok: false, status: 400, reason: "slug must be 2–40 lowercase letters, numbers, or dashes, start with a letter or number, and not be reserved" };
  }

  const input = {
    userId: scope.userId,
    owner,
    repo,
    branch,
    name: field(body, "name") ?? undefined,
    slug,
  };

  const result = await registerRepositoryProject(prisma, input);
  switch (result.status) {
    case "created":
    case "existing": return { ok: true, created: result.status === "created", project: result.project };
    case "capped": return { ok: false, status: 403, reason: result.reason };
    case "disconnected": return { ok: false, status: 409, reason: result.reason, reconnectSlug: result.slug };
    case "integrity":
    case "vanished":
    case "conflict": return { ok: false, status: 409, reason: result.reason };
    default: { const unreachable: never = result; return unreachable; }
  }
}

import { capError } from "@harness/core/entitlement.mjs";
import type { Prisma } from "@/generated/prisma/client";
import { appendAvailabilityEventIn, readOwnerAvailabilityIn } from "./project-availability-service";
import { availableSlug, slugCandidate } from "./project-slug-rule";

export type RegisterProjectInput = {
  userId: string;
  // 웹 폼은 사람이 고른 값을 넘긴다. 에이전트 등록은 생략하고 repo에서 파생시킨다 —
  // 파생은 **트랜잭션 안에서** 한다(아래). 밖에서 고르면 고른 뒤 만들기 전에 남이 채갈 수 있다.
  slug?: string;
  name?: string;
  owner: string;
  repo: string;
  branch: string;
  // 선택이다. 웹 폼은 첫 hs_ 토큰을 함께 만들지만(그 화면이 평문을 1회 노출한다),
  // 에이전트 등록(POST /api/projects)은 이미 hu_를 들고 있어 hs_가 필요 없고
  // 토큰 발급은 그 경로의 범위 밖이다. 없으면 tokens 키 자체를 넣지 않는다 —
  // 쓰지도 않을 자격증명을 만들어 두지 않기 위해서다.
  initialTokenHash?: string;
};

export type RegisterProjectResult =
  | { status: "created"; projectId: string; slug: string }
  // 같은 (ownerUserId, repoOwner, repo)가 이미 있다. 생성하지 않고 그것을 돌려준다.
  | { status: "existing"; projectId: string; slug: string }
  | { status: "capped"; reason: string };

export async function registerProjectIn(
  transaction: Prisma.TransactionClient,
  input: RegisterProjectInput,
): Promise<string | null> {
  const result = await registerProjectResultIn(transaction, input);
  return result.status === "capped" ? result.reason : null;
}

// 위 함수의 넓은 형태. 기존 호출자(웹 폼)는 "상한 문구 또는 null"만 필요하므로 registerProjectIn을
// 그대로 쓰고, 등록 라우트는 멱등 결과까지 봐야 하므로 이쪽을 쓴다.
export async function registerProjectResultIn(
  transaction: Prisma.TransactionClient,
  input: RegisterProjectInput,
): Promise<RegisterProjectResult> {
  const owner = await readOwnerAvailabilityIn(transaction, input.userId);

  // **멱등성.** 같은 저장소를 다시 등록하면 새로 만들지 않고 기존 행을 돌려준다 —
  // /harness:init의 재실행은 정상 흐름이고(런북 갱신·플랜 변경), 이 조회가 없으면
  // 재실행이 <repo>-2를 만들어 조용히 두 번째 프로젝트가 생긴다.
  //
  // **추가 쿼리가 아니다.** readOwnerAvailabilityIn이 이미 같은 트랜잭션·같은 스냅샷에서
  // 그 사용자의 모든 프로젝트를 OWNED_PROJECT_SELECT로 읽어 두었고 거기 repoOwner·repo가 있다.
  // 스키마에 @@unique([ownerUserId, repoOwner, repo])가 없으므로 트랜잭션 **밖** 조회는
  // 무방비 read-then-create 경쟁이 된다 — Serializable 안에 있어야 두 번째 요청이 P2034로
  // 직렬화 실패 후 재시도해 첫 요청이 만든 행을 본다.
  const existing = owner.projects.find((p) => p.repoOwner === input.owner && p.repo === input.repo);
  if (existing) return { status: "existing", projectId: existing.id, slug: existing.slug };

  const capMessage = capError(owner.plan, "projects", owner.projects.length);
  if (capMessage) return { status: "capped", reason: capMessage };

  // 슬러그를 여기서 고른다 — 같은 Serializable 트랜잭션 안이라 "고른 뒤 만들기 전에 채이는" 창이 없다.
  // **접미사는 다른 저장소가 같은 이름일 때만 붙는다**: 같은 저장소의 재등록은 위 멱등 조회가
  // 이미 잡았으므로 여기까지 오지 않는다.
  //
  // Project.slug는 **전역** 유니크라 taken도 전역으로 읽어야 한다. 이 사용자의 것만 보면
  // 남이 쓰는 슬러그를 골라 P2002로 떨어진다. 반대로 P2002가 났다고 기존 행을 돌려주면
  // **남의 프로젝트를 돌려주는 사고**가 되므로, 충돌은 여기서 미리 피한다.
  let slug = input.slug;
  if (slug === undefined) {
    const base = slugCandidate(input.repo) ?? "project";
    const rows = await transaction.project.findMany({ where: { slug: { startsWith: base } }, select: { slug: true } });
    slug = availableSlug(input.repo, new Set(rows.map((r) => r.slug)));
  }

  const project = await transaction.project.create({
    select: { id: true },
    data: {
      slug,
      name: input.name ?? slug,
      repoOwner: input.owner,
      repo: input.repo,
      branch: input.branch,
      available: true,
      lastSelectedAt: null,
      lastSyncedAt: null,
      ownerUser: { connect: { id: input.userId } },
      ...(input.initialTokenHash === undefined
        ? {}
        : { tokens: { create: { hash: input.initialTokenHash, label: "initial" } } }),
    },
  });
  await appendAvailabilityEventIn(transaction, { owner, change: {
    actor: "user", reason: "registration", toPlan: owner.plan, basis: "recent-registration",
    addedProjectIds: [project.id], removedProjectIds: [],
    availableProjectIds: [...owner.projects.filter((p) => p.available).map((p) => p.id), project.id],
  } });
  return { status: "created", projectId: project.id, slug };
}

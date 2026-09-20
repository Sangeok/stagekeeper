import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Prisma } from "@/generated/prisma/client";
import { registerProjectIn, registerProjectResultIn, type RegisterProjectInput } from "./project-registration-query";

const input: RegisterProjectInput = {
  userId: "user-1",
  slug: "stagekeeper",
  name: "Stagekeeper",
  owner: "octocat",
  repo: "stagekeeper",
  branch: "main",
  initialTokenHash: "hash",
};

function transactionWithOwnedCount(owned: number): {
  calls: Prisma.ProjectCreateArgs[];
  transaction: Parameters<typeof registerProjectIn>[0];
} {
  const calls: Prisma.ProjectCreateArgs[] = [];
  return {
    calls,
    // The double implements only operations exercised by registration, not Prisma's fluent client.
    transaction: {
      user: { findUniqueOrThrow: async () => ({ login: "test", projectAvailabilityVersion: 0, subscription: null }), updateMany: async () => ({ count: 1 }) },
      projectAvailabilityEvent: { create: async () => ({}) },
      project: {
        findMany: async () => Array.from({ length: owned }, (_, i) => ({ id: `old-${i}`, ownerUserId: input.userId, repoOwner: "octocat", available: true })),
        create: async (args: Prisma.ProjectCreateArgs) => {
          calls.push(args);
          return { id: "new-project" };
        },
      },
    } as unknown as Prisma.TransactionClient,
  };
}

describe("registerProjectIn", () => {
  it("writes direct ownership, availability, and the initial token without legacy shadows", async () => {
    const { calls, transaction } = transactionWithOwnedCount(0);

    const result = await registerProjectIn(transaction, input);

    assert.equal(result, null);
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0]?.data, {
      slug: "stagekeeper",
      name: "Stagekeeper",
      repoOwner: "octocat",
      repo: "stagekeeper",
      branch: "main",
      available: true,
      lastSelectedAt: null,
      lastSyncedAt: null,
      ownerUser: { connect: { id: "user-1" } },
      tokens: { create: { hash: "hash", label: "initial" } },
    });
  });

  it("returns the existing cap message without creating a project", async () => {
    const { calls, transaction } = transactionWithOwnedCount(1);

    const result = await registerProjectIn(transaction, input);

    assert.match(result ?? "", /project cap reached on the free plan/);
    assert.equal(calls.length, 0);
  });
});

// C — 에이전트 등록(POST /api/projects)이 쓰는 넓은 형태.
//
// **이 시험들이 증명하지 않는 것**: (i) 상한 동시성과 실제 직렬화 경쟁. 그건 Serializable
// 재시도와 version CAS가 걸린 경로라 격리 DB가 있어야 하고, 제안서도 그렇게 적었다.
// 여기서 고정하는 것은 **멱등 조회가 트랜잭션 안에서 일어난다는 구조**다 — 주입된 트랜잭션
// 하나로만 조회·생성이 이뤄지는지, 그리고 재등록에 생성이 아예 없는지.
describe("registerProjectResultIn — agent registration", () => {
  const owned = (rows: { slug: string; repo: string }[]) => {
    const calls: { creates: Prisma.ProjectCreateArgs[]; slugQueries: unknown[] } = { creates: [], slugQueries: [] };
    const transaction = {
      user: { findUniqueOrThrow: async () => ({ login: "test", projectAvailabilityVersion: 0, subscription: { plan: "max" } }), updateMany: async () => ({ count: 1 }) },
      projectAvailabilityEvent: { create: async () => ({}) },
      project: {
        findMany: async (args: { where?: { slug?: unknown } }) => {
          // 두 조회가 한 트랜잭션을 공유한다: 소유 목록(ownerUserId)과 슬러그 점유(startsWith).
          if (args?.where?.slug !== undefined) {
            calls.slugQueries.push(args.where.slug);
            return rows.map((r) => ({ slug: r.slug }));
          }
          return rows.map((r, i) => ({ id: `p-${i}`, slug: r.slug, ownerUserId: "user-1", repoOwner: "octocat", repo: r.repo, available: true }));
        },
        create: async (args: Prisma.ProjectCreateArgs) => { calls.creates.push(args); return { id: "new-project" }; },
      },
    } as unknown as Prisma.TransactionClient;
    return { calls, transaction };
  };

  const agentInput = { userId: "user-1", owner: "octocat", repo: "stagekeeper", branch: "main" };

  // (g) 같은 저장소 재등록. **생성이 한 번도 일어나면 안 된다** — 이게 무너지면 init 재실행이
  // <repo>-2를 만들어 조용히 두 번째 프로젝트가 생긴다.
  it("(g) returns the existing project for the same (owner, repo) and creates nothing", async () => {
    const { calls, transaction } = owned([{ slug: "stagekeeper", repo: "stagekeeper" }]);

    const result = await registerProjectResultIn(transaction, agentInput);

    assert.deepEqual(result, { status: "existing", projectId: "p-0", slug: "stagekeeper" });
    assert.equal(calls.creates.length, 0, "must not create on re-registration");
    assert.equal(calls.slugQueries.length, 0, "must not even look for a free slug");
  });

  it("creates with a slug derived from the repo when the user has nothing yet", async () => {
    const { calls, transaction } = owned([]);

    const result = await registerProjectResultIn(transaction, agentInput);

    assert.deepEqual(result, { status: "created", projectId: "new-project", slug: "stagekeeper" });
    assert.equal(calls.creates[0]?.data.slug, "stagekeeper");
    assert.equal(calls.creates[0]?.data.name, "stagekeeper", "name falls back to the slug");
  });

  // (j) 다른 저장소가 그 이름을 이미 쓴다 — 접미사로 피한다. 멱등 조회는 (owner, repo)로 하므로
  // 여기 걸리지 않는다. 슬러그 점유는 **전역**으로 읽어야 한다(Project.slug가 전역 유니크다).
  it("(j) suffixes the slug when a different repository already holds the name", async () => {
    const { calls, transaction } = owned([{ slug: "stagekeeper", repo: "other-repo" }]);

    const result = await registerProjectResultIn(transaction, agentInput);

    assert.equal(result.status, "created");
    assert.equal(result.status === "created" && result.slug, "stagekeeper-2");
    assert.deepEqual(calls.slugQueries, [{ startsWith: "stagekeeper" }]);
  });

  // 토큰 발급은 이 경로의 범위 밖이다 — 쓰지도 않을 hs_를 만들어 두지 않는다.
  it("omits the token relation entirely when no initialTokenHash is given", async () => {
    const { calls, transaction } = owned([]);

    await registerProjectResultIn(transaction, agentInput);

    assert.equal("tokens" in (calls.creates[0]?.data ?? {}), false);
  });
});

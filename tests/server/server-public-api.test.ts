import assert from "node:assert/strict";
import { it } from "node:test";
import { loadModule } from "./fixtures/load-module";

it("project and token runtime wrappers bind the injected database and preserve their public signatures", async () => {
  const calls: unknown[] = [];
  const prisma = {
    project: {
      findFirst: async (args: unknown) => { calls.push(args); return { id: "p" }; },
      findUniqueOrThrow: async (args: unknown) => { calls.push(args); return { repoOwner: "owner", repo: "repo", branch: "main" }; },
    },
    userToken: { findUnique: async (args: unknown) => { calls.push(args); return { id: "t", userId: "u", revokedAt: null, expiresAt: null }; } },
    $transaction: async () => ({ status: "created", projectId: "p", slug: "mine" }),
  };
  const dependencies = { "../db": { prisma } };
  const projects = loadModule<typeof import("../../src/server/projects/api.server")>("src/server/projects/api.server.ts", dependencies);
  assert.equal(await projects.projectForUser("mine", "u"), "p");
  assert.deepEqual(await projects.loadProjectRepository("p"), { owner: "owner", repo: "repo", branch: "main" });
  assert.deepEqual(await projects.registerWebProject({ userId: "u", owner: "owner", repo: "repo", branch: "main", slug: "mine", initialTokenHash: "hash" }),
    { ok: true, item: { status: "created", projectId: "p", slug: "mine" } });
  const tokens = loadModule<typeof import("../../src/server/tokens/api.server")>("src/server/tokens/api.server.ts", dependencies);
  assert.equal((await tokens.findUserTokenByHash("hash"))?.id, "t");
  assert.deepEqual(JSON.parse(JSON.stringify(calls)), [
    { where: { slug: "mine", ownerUserId: "u" }, select: { id: true } },
    { where: { id: "p" }, select: { repoOwner: true, repo: true, branch: true } },
    { where: { hash: "hash" }, select: { id: true, userId: true, revokedAt: true, expiresAt: true } },
  ]);
});

it("runtime aggregate APIs forward exactly their intended bindings without creating Actions", () => {
  const cases: { path: string; owners: Record<string, string[]> }[] = [
    { path: "pipeline", owners: { "./board": ["addBacklog", "updateBacklog", "removeBacklog", "backlogWithStatus", "latestBoard", "latestBoardWithEvents", "latestRowFor", "getWithHistory", "hasHistoryBefore", "projectHistory", "projectHistoryItems", "hasProjectHistoryBefore", "currentRoundIds", "propose", "changePipeline", "transition", "discard", "gate", "retryAcceptance"] } },
    { path: "usage", owners: { "./account-usage": ["accountUsage"], "./request-rate": ["limitAccountRequest", "limitProjectRequest"] } },
    { path: "rest", owners: { "./project-identity": ["projectIdentityFor"], "./templates": ["templatesFor"], "./runbook": ["recordRunbook"], "./project-registration": ["registerProject"], "./runner": ["runnerRequest"] } },
    { path: "mcp", owners: { "./deps": ["prismaToolDeps", "verifyProjectToken"], "./owner-deps": ["prismaOwnerToolDeps", "verifyOwnerToken"] } },
  ];
  for (const { path, owners } of cases) {
    const dependencies: Record<string, Record<string, unknown>> = {}, expected: Record<string, unknown> = {};
    for (const [owner, names] of Object.entries(owners)) {
      const bindings = Object.fromEntries(names.map(name => [name, () => name]));
      dependencies[owner] = bindings; Object.assign(expected, bindings);
    }
    const entry = loadModule<Record<string, unknown>>(`src/server/${path}/api.server.ts`, dependencies);
    assert.deepEqual(Object.keys(entry).sort(), Object.keys(expected).sort());
    for (const [name, value] of Object.entries(expected)) assert.equal(entry[name], value);
  }
});

it("runner runtime wrappers bind the shared database to the injected service", async () => {
  const prisma = { name: "prisma" };
  const service = {
    readRunnerState: async (client: unknown, projectId: string) => ({ client, projectId }),
    readRunnerSummaries: async (client: unknown, ids: readonly string[]) => ({ client, ids }),
    runRunnerOp: async (client: unknown, input: unknown) => ({ client, input }),
  };
  const runners = loadModule<typeof import("../../src/server/runners/api.server")>("src/server/runners/api.server.ts", { "../db": { prisma }, "./runner-service": service });
  assert.deepEqual(Object.keys(runners).sort(), ["readRunnerState", "readRunnerSummaries", "runRunnerOp"]);
  assert.deepEqual(await runners.readRunnerState("p"), { client: prisma, projectId: "p" });
  assert.deepEqual(await runners.readRunnerSummaries(["p", "q"]), { client: prisma, ids: ["p", "q"] });
  const input = { projectId: "p", tokenId: "t", request: { op: "stop", session: "s", reason: "owner" } } as const;
  assert.deepEqual(await runners.runRunnerOp(input), { client: prisma, input });
});

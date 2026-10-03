import assert from "node:assert/strict";
import { it } from "node:test";
import type { PrismaClient } from "../../src/generated/prisma/client";
import * as results from "../../src/fsd/shared/api/result";
import { renameProjectToken, renameUserToken } from "../../src/server/token-management-query";
import { createBoardQueries } from "../../src/server/pipeline/board-query";
import { loadModule } from "./fixtures/load-module";
import { assertActions } from "./fixtures/action-manifest";

const projectPath = "src/fsd/features/manage-token/api/manage-token.server.ts";
const userPath = "src/fsd/features/manage-user-token/api/manage-user-token.server.ts";
const backlogPath = "src/fsd/features/edit-backlog/api/edit-backlog.server.ts";

it("all eight authenticated mutations reject malformed IDs before delegate writes or revalidation", async () => {
  let guards = 0; let writes = 0; let refreshes = 0;
  const write = async () => { writes++; return { count: 1 }; };
  const dependencies = {
    "next/cache": { revalidatePath: () => { refreshes++; } }, "@/fsd/shared/api/result": results,
    "@/fsd/shared/routes/project": { projectPath: () => "/p/mine/tokens" }, "@/fsd/shared/routes/user-tokens": { userTokensPath: () => "/settings/tokens" },
    "@/server/auth/guard": {
      requireProjectOwner: async () => { guards++; return { projectId: "p", userId: "u" }; },
      requireUser: async () => { guards++; return { userId: "u" }; },
      requireProjectWrite: async () => { guards++; return { ok: true, projectId: "p", userId: "u" }; },
    },
    "@/server/db": { prisma: { projectToken: { updateMany: write }, ownerToken: { updateMany: write }, userToken: { updateMany: write } } },
    "@/server/project-token": {}, "@/server/token-management-query": { renameProjectToken: write, renameUserToken: write },
    "@/server/pipeline/board": { updateBacklog: write, removeBacklog: write },
  };
  const project = loadModule<typeof import("../../src/fsd/features/manage-token/api/manage-token.server")>(projectPath, dependencies);
  const user = loadModule<typeof import("../../src/fsd/features/manage-user-token/api/manage-user-token.server")>(userPath, dependencies);
  const backlog = loadModule<typeof import("../../src/fsd/features/edit-backlog/api/edit-backlog.server")>(backlogPath, dependencies);
  for (const raw of [undefined, null, {}, { not: "one" }, "", " \n "]) {
    const id = raw as string; // Deliberately cross the public runtime boundary.
    for (const revoke of [() => project.revokeToken("mine", id), () => project.revokeOwnerToken("mine", id), () => user.revokeUserToken(id)]) await assert.rejects(revoke, /Invalid token ID\./);
    for (const rename of [() => project.renameToken("mine", id, "label"), () => project.renameOwnerToken("mine", id, "label"), () => user.renameUserToken(id, "label")]) assert.deepEqual(JSON.parse(JSON.stringify(await rename())), { success: false, error: "Token not found." });
    for (const update of [() => backlog.updateBacklogItem("mine", id, { status: "idle" }, new FormData()), () => backlog.removeBacklogItem("mine", id)]) assert.equal((await update()).status, "error");
  }
  assert.equal(guards, 48); assert.equal(writes, 0); assert.equal(refreshes, 0);
});

it("direct rename and backlog services reject malformed selectors without even reading DB", async () => {
  const db = {} as PrismaClient;
  const board = createBoardQueries(db);
  for (const raw of [undefined, null, {}, "", "  "]) {
    const id = raw as string;
    assert.equal((await renameProjectToken(db, { tokenId: id, label: "name", projectId: "p", userId: "u", kind: "agent" })).ok, false);
    assert.equal((await renameUserToken(db, { tokenId: id, label: "name", userId: "u" })).ok, false);
    assert.equal((await board.updateBacklog("p", id, { title: "title", area: "", source: "", type: null, typeBefore: null })).ok, false);
    assert.equal((await board.removeBacklog("p", id)).ok, false);
  }
});

if (process.env.RDC_CHECK_ACTION_MANIFEST === "true") it("fresh build exposes the guarded eight mutation exports", () => {
  assertActions(projectPath, ["revokeToken", "revokeOwnerToken", "renameToken", "renameOwnerToken"]);
  assertActions(userPath, ["revokeUserToken", "renameUserToken"]);
  assertActions(backlogPath, ["updateBacklogItem", "removeBacklogItem"]);
});

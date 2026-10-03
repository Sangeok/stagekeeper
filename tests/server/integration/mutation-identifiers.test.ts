import assert from "node:assert/strict";
import { it } from "node:test";
import { randomUUID } from "node:crypto";
import { renameProjectToken, renameUserToken } from "../../../src/server/token-management-query";
import { createBoardQueries } from "../../../src/server/pipeline/board-query";
import { cleanup, connections, fixture } from "./support";

it("invalid direct token/backlog selectors leave every row unchanged and valid operations affect one target", async () => {
  const pool = connections(1); const db = pool.all[0]; let userId: string | undefined;
  try {
    const f = await fixture(db, { plan: "pro" }); userId = f.userId;
    const tokens = await Promise.all([1, 2].map(i => db.projectToken.create({ data: { projectId: f.projectId, hash: randomUUID(), label: `project-${i}` } })));
    await Promise.all([1, 2].map(i => db.ownerToken.create({ data: { projectId: f.projectId, userId: f.userId, hash: randomUUID(), label: `owner-${i}` } })));
    const users = await Promise.all([1, 2].map(i => db.userToken.create({ data: { userId: f.userId, hash: randomUUID(), label: `user-${i}` } })));
    await db.backlogItem.create({ data: { projectId: f.projectId, key: "K-2", title: "other", area: "", source: "" } });
    const snapshot = async () => JSON.stringify(await Promise.all([
      db.projectToken.findMany({ where: { projectId: f.projectId }, orderBy: { id: "asc" } }), db.ownerToken.findMany({ where: { projectId: f.projectId }, orderBy: { id: "asc" } }),
      db.userToken.findMany({ where: { userId: f.userId }, orderBy: { id: "asc" } }), db.backlogItem.findMany({ where: { projectId: f.projectId }, orderBy: { key: "asc" } }),
    ]));
    const before = await snapshot(); const board = createBoardQueries(db);
    for (const raw of [undefined, null, {}, { not: "one" }, "", "  "]) {
      const id = raw as string;
      for (const kind of ["agent", "owner"] as const) assert.equal((await renameProjectToken(db, { tokenId: id, label: "changed", projectId: f.projectId, userId: f.userId, kind })).ok, false);
      assert.equal((await renameUserToken(db, { tokenId: id, label: "changed", userId: f.userId })).ok, false);
      assert.equal((await board.updateBacklog(f.projectId, id, { title: "changed", area: "", source: "", type: null, typeBefore: null })).ok, false);
      assert.equal((await board.removeBacklog(f.projectId, id)).ok, false);
    }
    assert.equal(await snapshot(), before);
    assert.ok((await renameProjectToken(db, { tokenId: tokens[0].id, label: "changed", projectId: f.projectId, userId: f.userId, kind: "agent" })).ok);
    assert.equal((await db.projectToken.findUniqueOrThrow({ where: { id: tokens[1].id } })).label, "project-2");
    assert.ok((await renameUserToken(db, { tokenId: users[0].id, label: "changed", userId: f.userId })).ok);
    assert.equal((await board.removeBacklog(f.projectId, "K-1")).ok, false, "open item protected");
    assert.ok((await board.removeBacklog(f.projectId, "K-2")).ok);
  } finally { await cleanup(db, userId); await pool.disconnect(); }
});

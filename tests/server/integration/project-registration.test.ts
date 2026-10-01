import assert from "node:assert/strict";
import { it } from "node:test";
import { newToken } from "../../../packages/core/token.mjs";
import { POST } from "../../../src/app/api/projects/route";
import { cleanup, connections, fixture, type Fixture } from "./support";

it("invalid explicit slugs never change a real database, including an already registered repository", async () => {
  const pool = connections(1); const db = pool.all[0]; let f: Fixture | undefined;
  try {
    f = await fixture(db, { plan: "pro" });
    const token = newToken("user");
    await db.userToken.create({ data: { userId: f.userId, hash: token.hash, label: "registration test" } });
    const snapshot = () => Promise.all([
      db.user.findUniqueOrThrow({ where: { id: f!.userId } }),
      db.project.findMany({ where: { ownerUserId: f!.userId }, orderBy: { id: "asc" } }),
      db.projectAvailabilityEvent.findMany({ where: { ownerUserId: f!.userId }, orderBy: { id: "asc" } }),
      db.projectToken.findMany({ where: { project: { ownerUserId: f!.userId } }, orderBy: { id: "asc" } }),
    ]);
    const before = await snapshot();
    const post = (repo: string, slug: unknown) => POST(new Request("https://example.test/api/projects", {
      method: "POST", headers: { authorization: `Bearer ${token.plain}`, "content-type": "application/json" },
      body: JSON.stringify({ owner: f!.id, repo, slug, branch: "release/1.0" }),
    }));
    for (const repo of [f.id, "unregistered"]) for (const slug of ["new", "x/y", "UPPER", "a", "a".repeat(41), "a b"]) {
      const response = await post(repo, slug);
      assert.equal(response.status, 400);
      assert.equal(typeof (await response.json()).error, "string");
      assert.deepEqual(await snapshot(), before);
    }
    for (const [repo, slug] of [["short", " ab "], ["long", "a".repeat(40)]]) {
      const response = await post(repo, slug);
      assert.equal(response.status, 201);
      const body = await response.json();
      assert.equal(body.project.slug, slug.trim()); assert.equal(body.project.branch, "release/1.0");
      const existing = await post(repo, "different-slug");
      assert.equal(existing.status, 200); assert.equal((await existing.json()).project.slug, slug.trim());
    }
  } finally { await cleanup(db, f?.userId); await pool.disconnect(); }
});

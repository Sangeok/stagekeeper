import assert from "node:assert/strict";
import { it } from "node:test";
import type { PrismaClient } from "../../../src/generated/prisma/client";
import { connections, fixture } from "./support";

for (const model of ["Subscription", "Project", "Workspace", "BacklogItem", "BoardItem"] as const) {
  it(`rolls back the complete fixture when ${model} creation fails`, async () => {
    const pool = connections(1);
    const [db] = pool.all;
    const failure = new Error(`injected ${model} failure`);
    let login: string | undefined;
    const observed = db.$extends({ query: { user: { async create({ args, query }) {
      login = args.data.login;
      return query(args);
    } } } });
    const failing = observed.$extends({ query: { $allModels: { async $allOperations({ model: current, operation, args, query }) {
      if (current === model && operation === "create") throw failure;
      return query(args);
    } } } });
    try {
      await assert.rejects(fixture(failing as unknown as PrismaClient, { plan: "pro" }), error => error === failure);
      assert.ok(login);
      assert.equal(await db.user.count({ where: { login } }), 0);
      assert.equal(await db.project.count({ where: { slug: login } }), 0);
    } finally {
      try { if (login) await db.user.deleteMany({ where: { login } }); }
      finally { await pool.disconnect(); }
    }
  });
}

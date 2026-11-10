import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { it } from "node:test";
import { withPrisma } from "../../../scripts/lib/prisma";
import { createFixtureUser, deleteFixtureUser } from "../../../scripts/rehearsals/rehearse-client-init-smoke";
import { testDatabaseUrl } from "./support";

it("smoke fixtures use the explicit test database while preserving the parent database setting", async () => {
  const databaseUrl = testDatabaseUrl();
  const previousDatabase = process.env.DATABASE_URL;
  const parentDatabase = "postgresql://unused.invalid/must_not_connect";
  const login = `database-helper-${randomUUID()}`;
  let userId: string | undefined;
  process.env.DATABASE_URL = parentDatabase;
  try {
    userId = await createFixtureUser(login, randomUUID(), databaseUrl);
    await withPrisma(async db => {
      const [target] = await db.$queryRaw<{ database: string }[]>`SELECT current_database() AS database`;
      assert.equal(target.database, decodeURIComponent(new URL(databaseUrl).pathname.slice(1)));
      const user = await db.user.findUniqueOrThrow({ where: { id: userId }, include: { userTokens: true } });
      assert.equal(user.login, login);
      assert.equal(user.userTokens.length, 1);
    }, databaseUrl);
    assert.equal(process.env.DATABASE_URL, parentDatabase);
    await deleteFixtureUser(userId, databaseUrl);
    assert.equal(await withPrisma(db => db.user.count({ where: { id: userId } }), databaseUrl), 0);
    assert.equal(process.env.DATABASE_URL, parentDatabase);
    userId = undefined;
  } finally {
    try { if (userId) await deleteFixtureUser(userId, databaseUrl); }
    finally {
      if (previousDatabase === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = previousDatabase;
    }
  }
});

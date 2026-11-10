import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { it } from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const code = ts.transpileModule(readFileSync(new URL("./prisma.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function fixture(env: { DATABASE_URL?: string } = {}, disconnectError?: Error) {
  const connections: string[] = [], errors: string[] = [], exits: number[] = [];
  let disconnects = 0;
  const dependencies: Record<string, unknown> = {
    "dotenv/config": {},
    "@prisma/adapter-pg": { PrismaPg: class {
      constructor(options: { connectionString: string }) { connections.push(options.connectionString); }
    } },
    "../../src/generated/prisma/client": { PrismaClient: class {
      async $disconnect() {
        disconnects++;
        if (disconnectError) throw disconnectError;
      }
    } },
  };
  const exported = {};
  runInNewContext(code, {
    exports: exported,
    process: { env, exit: (code: number) => { exits.push(code); throw new Error("CLI exited"); } },
    console: { error: (message: string) => errors.push(message) },
    require: (name: string) => { assert.ok(name in dependencies, name); return dependencies[name]; },
  });
  return { ...(exported as typeof import("./prisma")), connections, errors, exits, disconnects: () => disconnects };
}

it("uses an explicit database URL without changing or consulting the parent selection", async () => {
  const env = { DATABASE_URL: "postgresql://parent/database" };
  const db = fixture(env);
  assert.equal(await db.withPrisma(async () => "result", "postgresql://test/stagekeeper_test_helpers"), "result");
  assert.deepEqual(db.connections, ["postgresql://test/stagekeeper_test_helpers"]);
  assert.deepEqual(env, { DATABASE_URL: "postgresql://parent/database" });
  assert.equal(db.disconnects(), 1);
});

it("preserves the environment default for existing CLI callers", async () => {
  const env = { DATABASE_URL: "postgresql://cli/database" };
  const db = fixture(env);
  await db.withPrisma(async () => undefined);
  assert.deepEqual(db.connections, [env.DATABASE_URL]);
  assert.equal(db.disconnects(), 1);
});

it("preserves exit 2 before creating a connection when the selected URL is missing", async () => {
  for (const env of [{}, { DATABASE_URL: "postgresql://must-not-be-used/database" }]) {
    const db = fixture(env);
    let called = false;
    await assert.rejects(db.withPrisma(async () => { called = true; }, ""), /CLI exited/);
    assert.equal(called, false);
    assert.deepEqual(db.connections, []);
    assert.deepEqual(db.exits, [2]);
    assert.deepEqual(db.errors, ["DATABASE_URL is not set — copy .env.example to .env and fill it in"]);
  }
  const db = fixture();
  await assert.rejects(db.withPrisma(async () => undefined), /CLI exited/);
  assert.deepEqual(db.exits, [2]);
});

it("waits for the callback before disconnecting", async () => {
  const db = fixture({ DATABASE_URL: "postgresql://cli/database" });
  let finish: (value: number) => void = () => assert.fail("callback was not started");
  const pending = db.withPrisma(() => new Promise<number>(resolve => { finish = resolve; }));
  assert.equal(db.disconnects(), 0);
  finish(42);
  assert.equal(await pending, 42);
  assert.equal(db.disconnects(), 1);
});

it("disconnects after callback failure and preserves the failure", async () => {
  const db = fixture({ DATABASE_URL: "postgresql://cli/database" });
  const failure = new Error("work failed");
  await assert.rejects(db.withPrisma(async () => { throw failure; }), error => error === failure);
  assert.equal(db.disconnects(), 1);
});

it("propagates a disconnect failure", async () => {
  const failure = new Error("disconnect failed");
  const db = fixture({ DATABASE_URL: "postgresql://cli/database" }, failure);
  await assert.rejects(db.withPrisma(async () => undefined), error => error === failure);
  assert.equal(db.disconnects(), 1);
});

import assert from "node:assert/strict";
import { it } from "node:test";
import { runIntegration, validateTestDatabase } from "./test-server-integration.mjs";

const testUrl = "postgresql://user:secret@localhost/stagekeeper_test_receipts";
it("fails closed for missing, unsafe or equivalent database URLs without exposing credentials", () => {
  for (const env of [{}, { TEST_DATABASE_URL: "not-a-url-secret" }, { TEST_DATABASE_URL: "mysql://x/stagekeeper_test_x" }, { TEST_DATABASE_URL: "postgres://x/production" }, { TEST_DATABASE_URL: testUrl, DATABASE_URL: "postgres://other:password@127.0.0.1:5432/stagekeeper_test_receipts?schema=other" }]) {
    assert.throws(() => validateTestDatabase(env), (error) => !/secret|password/.test(error.message));
  }
  assert.equal(validateTestDatabase({ TEST_DATABASE_URL: testUrl, DATABASE_URL: "postgres://x/production" }), testUrl);
});
it("validates before spawning, deploys migrations before serial tests, and stops on failure", async () => {
  const calls = [];
  const run = async (...args) => { calls.push(args); };
  await assert.rejects(runIntegration({}, run));
  assert.equal(calls.length, 0);
  await runIntegration({ TEST_DATABASE_URL: testUrl }, run);
  assert.equal(calls.length, 2);
  assert.equal(calls[0][0], process.execPath);
  assert.deepEqual(calls[0][1], ["node_modules/prisma/build/index.js", "migrate", "deploy"]);
  assert.ok(calls[1][1].includes("--test-concurrency=1"));
  assert.equal(calls[1][2].DATABASE_URL, testUrl);
  let count = 0;
  await assert.rejects(runIntegration({ TEST_DATABASE_URL: testUrl }, async () => { count++; throw new Error("failed"); }));
  assert.equal(count, 1);
});

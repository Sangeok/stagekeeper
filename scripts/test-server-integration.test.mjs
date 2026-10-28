import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { it } from "node:test";
import { fileURLToPath } from "node:url";
import { runIntegration, validateTestDatabase } from "./test-server-integration.mjs";

const testUrl = "postgresql://user:secret@localhost/stagekeeper_test_receipts";
it("handles help and invalid CLI arguments before loading database configuration", () => {
  const cwd = mkdtempSync(join(realpathSync(tmpdir()), "stagekeeper-integration-cli-"));
  const script = fileURLToPath(new URL("./test-server-integration.mjs", import.meta.url));
  const env = { ...process.env, DATABASE_URL: "invalid-private-database", TEST_DATABASE_URL: "invalid-private-test-database" };
  try {
    const help = spawnSync(process.execPath, [script, "--help"], { cwd, env, encoding: "utf8" });
    assert.equal(help.status, 0, help.stderr);
    assert.match(help.stdout, /Usage:/);
    assert.equal(help.stderr, "");
    for (const args of [["--reset"], ["unexpected"], ["--help", "--reset"]]) {
      const result = spawnSync(process.execPath, [script, ...args], { cwd, env, encoding: "utf8" });
      assert.equal(result.status, 2, result.stderr);
      assert.match(result.stderr, /Usage:/);
      assert.doesNotMatch(result.stderr, /private|distinct from DATABASE_URL/);
    }
    const run = spawnSync(process.execPath, [script], { cwd, env, encoding: "utf8" });
    assert.equal(run.status, 1, run.stderr);
    assert.match(run.stderr, /distinct from DATABASE_URL/);
    assert.doesNotMatch(run.stderr, /private/);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});
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

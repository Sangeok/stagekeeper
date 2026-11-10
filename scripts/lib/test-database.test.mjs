import assert from "node:assert/strict";
import { it } from "node:test";
import { validateTestDatabase, validateTestDatabaseUrl } from "./test-database.mjs";

const testUrl = "postgresql://user:secret@localhost/stagekeeper_test_receipts";

it("rejects missing, malformed, non-PostgreSQL and non-test URLs without exposing credentials", () => {
  for (const url of [undefined, "", "not-a-url-secret", "mysql://user:password@host/stagekeeper_test_x", "postgres://host/production", "postgres://host/stagekeeper_test_", "postgres://host/stagekeeper_test_x%2Fproduction"]) {
    for (const validate of [() => validateTestDatabaseUrl(url), () => validateTestDatabase({ TEST_DATABASE_URL: url })]) {
      assert.throws(validate, error => error instanceof Error && !/secret|password/.test(error.message));
    }
  }
});

it("rejects the same database across loopback aliases, default ports and different credentials or schemas", () => {
  for (const host of ["localhost", "LOCALHOST", "127.0.0.1", "[::1]"]) {
    const databaseUrl = `postgres://other:password@${host}:5432/stagekeeper_test_%72eceipts?schema=other`;
    assert.throws(() => validateTestDatabase({ TEST_DATABASE_URL: testUrl, DATABASE_URL: databaseUrl }), /distinct from DATABASE_URL/);
  }
});

it("allows distinct database identities and preserves the original connection string", () => {
  for (const databaseUrl of [undefined, "postgres://localhost/production", "postgres://other-host/stagekeeper_test_receipts", "postgres://localhost:5433/stagekeeper_test_receipts"]) {
    const env = { TEST_DATABASE_URL: testUrl, DATABASE_URL: databaseUrl };
    assert.equal(validateTestDatabase(env), testUrl);
    assert.deepEqual(env, { TEST_DATABASE_URL: testUrl, DATABASE_URL: databaseUrl });
  }
});

it("validates a child test URL after the runner has selected it for both environment variables", () => {
  const env = { TEST_DATABASE_URL: testUrl, DATABASE_URL: testUrl };
  assert.equal(validateTestDatabaseUrl(env.TEST_DATABASE_URL), testUrl);
  assert.throws(() => validateTestDatabase(env), /distinct from DATABASE_URL/);
});

it("rejects an invalid parent database URL without exposing its input", () => {
  assert.throws(() => validateTestDatabase({ TEST_DATABASE_URL: testUrl, DATABASE_URL: "invalid-private-password" }), error => !error.message.includes("private-password"));
});

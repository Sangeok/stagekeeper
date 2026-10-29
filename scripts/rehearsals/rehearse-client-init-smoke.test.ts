import assert from "node:assert/strict";
import path from "node:path";
import { it } from "node:test";
import { main, parseArguments } from "./rehearse-client-init-smoke";

const TEMPLATES = path.resolve("templates-checkout");
const COMMIT = "a".repeat(40);
const VALID = ["--client", "claude", "--scenario", "new-user", "--templates", TEMPLATES, "--plugin-source", "github-branch", "--plugin-branch", "harness/e2e", "--plugin-commit", COMMIT];

it("accepts the Claude new-user run from a GitHub branch", () => {
  const options = parseArguments(VALID);
  assert.equal(options.client, "claude");
  assert.equal(options.pluginBranch, "harness/e2e");
  assert.equal(options.allowMachineChanges, false);
});

it("accepts the update run only with a previous release commit", () => {
  const update = VALID.map(value => value === "new-user" ? "update" : value);
  assert.equal(parseArguments([...update, "--previous-ref", "b".repeat(40)]).previousRef, "b".repeat(40));
  assert.throws(() => parseArguments(update));
  assert.throws(() => parseArguments([...update, "--previous-ref", "main"]));
  assert.throws(() => parseArguments([...VALID, "--previous-ref", "b".repeat(40)]));
});

it("rejects unknown, duplicate, missing, relative and unimplemented arguments before any work", () => {
  const invalid = [
    [],
    [...VALID, "--unknown"],
    [...VALID, "--client", "claude"],
    VALID.filter(value => value !== "--plugin-branch" && value !== "harness/e2e"),
    VALID.map(value => value === TEMPLATES ? "templates-checkout" : value),
    VALID.map(value => value === COMMIT ? "abc" : value),
    VALID.map(value => value === "new-user" ? "update" : value),
    VALID.map(value => value === "claude" ? "codex" : value),
  ];
  for (const args of invalid) assert.throws(() => parseArguments(args));
});

it("prints usage with --help and exits 2 on an unknown argument", async () => {
  assert.equal(await main(["--help"], {}), 0);
  assert.equal(await main(["--unknown"], {}), 2);
});

it("refuses to change the machine outside CI unless asked to", async () => {
  assert.equal(await main(VALID, {}), 2);
  assert.equal(await main(VALID, { CI: "false" }), 2);
});

it("refuses a database that is not a stagekeeper_test_* database before any work", async () => {
  assert.equal(await main(VALID, { CI: "true", TEST_DATABASE_URL: "postgresql://postgres@127.0.0.1:5432/stagekeeper" }), 2);
});

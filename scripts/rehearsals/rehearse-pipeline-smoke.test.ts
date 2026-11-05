import assert from "node:assert/strict";
import path from "node:path";
import { it } from "node:test";
import { main, parseArguments } from "./rehearse-pipeline-smoke";

const TEMPLATES = path.resolve("templates-checkout");
const TRANSCRIPTS = path.resolve("pipeline-transcripts.bin");
const COMMIT = "a".repeat(40);
const KEY = Buffer.alloc(32, 7).toString("base64");
const DATABASE = "postgresql://postgres@127.0.0.1:5432/stagekeeper_test_pipeline";
const VALID = ["--templates", TEMPLATES, "--plugin-branch", "dev", "--plugin-commit", COMMIT, "--transcripts", TRANSCRIPTS];

it("accepts a dev run with the default wait", () => {
  const options = parseArguments(VALID);
  assert.equal(options.pluginBranch, "dev");
  assert.equal(options.waitMinutes, 75);
  assert.equal(options.allowMachineChanges, false);
  assert.equal(parseArguments([...VALID, "--wait-minutes", "10"]).waitMinutes, 10);
});

it("runs the slug scenario unless the truncate regression is named", () => {
  assert.equal(parseArguments(VALID).scenario, "slug");
  assert.equal(parseArguments([...VALID, "--scenario", "truncate"]).scenario, "truncate");
  assert.throws(() => parseArguments([...VALID, "--scenario", "other"]), /--scenario/);
  assert.throws(() => parseArguments([...VALID, "--scenario", "constructor"]), /--scenario/);
});

it("rejects unknown, duplicate, missing, relative and out-of-range arguments before any work", () => {
  const invalid = [
    [],
    [...VALID, "--unknown"],
    [...VALID, "--plugin-branch", "dev"],
    VALID.filter(value => value !== "--plugin-branch" && value !== "dev"),
    VALID.map(value => value === TEMPLATES ? "templates-checkout" : value),
    VALID.map(value => value === TRANSCRIPTS ? "pipeline-transcripts.bin" : value),
    VALID.map(value => value === COMMIT ? "abc" : value),
    [...VALID, "--wait-minutes", "4"],
    [...VALID, "--wait-minutes", "91"],
    [...VALID, "--wait-minutes", "1.5"],
  ];
  for (const args of invalid) assert.throws(() => parseArguments(args));
});

it("prints usage with --help and exits 2 on an unknown argument", async () => {
  assert.equal(await main(["--help"], {}), 0);
  assert.equal(await main(["--unknown"], {}), 2);
});

it("refuses to change the machine outside CI unless asked to", async () => {
  assert.equal(await main(VALID, { TRANSCRIPT_KEY: KEY, TEST_DATABASE_URL: DATABASE }), 2);
});

it("refuses a database that is not a stagekeeper_test_* database before any work", async () => {
  assert.equal(await main(VALID, { CI: "true", TRANSCRIPT_KEY: KEY, TEST_DATABASE_URL: "postgresql://postgres@127.0.0.1:5432/stagekeeper" }), 2);
});

it("refuses a missing or short transcript key before any work", async () => {
  assert.equal(await main(VALID, { CI: "true", TEST_DATABASE_URL: DATABASE }), 2);
  assert.equal(await main(VALID, { CI: "true", TEST_DATABASE_URL: DATABASE, TRANSCRIPT_KEY: Buffer.alloc(16).toString("base64") }), 2);
});

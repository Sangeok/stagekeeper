import assert from "node:assert/strict";
import path from "node:path";
import { it } from "node:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { EventEmitter } from "node:events";
import ts from "typescript";
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

for (const mode of ["stopped", "stop-failure", "start-cleanup-failure"]) {
  it(`pipeline cleanup retains its primary failure, seals results and preserves fixtures on ${mode}`, async () => {
    const source = ts.createSourceFile("caller.ts", readFileSync(new URL("./rehearse-pipeline-smoke.ts", import.meta.url), "utf8"), ts.ScriptTarget.Latest, true);
    const main = source.statements.find((node): node is ts.FunctionDeclaration => ts.isFunctionDeclaration(node) && node.name?.text === "runPipelineSmoke");
    assert.ok(main?.body);
    const statement = main.body.statements.find((node): node is ts.TryStatement => ts.isTryStatement(node) && !!node.finallyBlock);
    assert.ok(statement?.finallyBlock);
    const code = ts.transpileModule("(async () => " + statement.finallyBlock.getText(source) + ")()", { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
    const events: string[] = [], run = { failure: "original-failure", steps: [] as { step: string; result: string }[] };
    const record: Record<string, unknown> = {}, processFixture = new EventEmitter(), interrupt = () => {};
    processFixture.on("SIGINT", interrupt); processFixture.on("SIGTERM", interrupt);
    const context = { run, record, process: processFixture, interrupt, plugin: undefined, repo: undefined,
      serverCleanupFailed: mode === "start-cleanup-failure", userId: "fixture", verifiedItem: undefined,
      databaseUrl: "fixture", work: "fixture", secrets: { key: Buffer.alloc(32) }, options: { transcripts: "fixture" },
      server: { stop: async () => { events.push("stop"); if (mode === "stop-failure") throw new Error("stop"); } },
      deleteFixtureUser: async () => { events.push("delete"); },
      cleanup: async (_label: string, action: () => Promise<void>) => action(),
      statuses: { last: () => ({ state: "stopped" }) },
      sealAll: () => { events.push("seal"); return true; }, console: { error: () => {} },
    };
    await runInNewContext(code, context);
    assert.equal(run.failure, "original-failure");
    assert.equal(processFixture.listenerCount("SIGINT") + processFixture.listenerCount("SIGTERM"), 0);
    assert.deepEqual(events, mode === "stopped" ? ["stop", "delete", "seal"] : ["stop", "seal"]);
    assert.equal(record.sealed, true);
    if (mode !== "stopped") assert.ok(run.steps.some(step => step.step === "server-cleanup" && step.result === "fail"));
  });
}

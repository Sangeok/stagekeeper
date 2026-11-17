import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { it } from "node:test";
import { EventEmitter } from "node:events";
import { randomBytes } from "node:crypto";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { main, parseArguments, Run, Smoke } from "./rehearse-client-init-smoke";

const TEMPLATES = path.resolve("templates-checkout");
const COMMIT = "a".repeat(40);
const VALID = ["--client", "claude", "--scenario", "new-user", "--templates", TEMPLATES, "--plugin-source", "github-branch", "--plugin-branch", "harness/e2e", "--plugin-commit", COMMIT];
const LEAVES_A_CHILD_RUNNING = [
  "const { spawn } = require(\"node:child_process\");",
  "const child = spawn(process.execPath, [\"-e\", \"setTimeout(() => {}, 60000)\"], { detached: true, stdio: [\"ignore\", \"inherit\", \"inherit\"] });",
  "child.unref();",
  "console.log(JSON.stringify({ started: child.pid }));",
].join("\n");

function runLeavingAChild(timeout: number, outputName?: string) {
  const work = mkdtempSync(path.join(tmpdir(), "rehearsal-run-"));
  const run = new Run(path.join(work, "commands.log"));
  let child: number | undefined;
  try {
    const outcome = run.command(process.execPath, ["-e", LEAVES_A_CHILD_RUNNING], tmpdir(), process.env, timeout, outputName && path.join(work, outputName));
    child = Number(/"started":(\d+)/.exec(outcome.stdout)?.[1]) || undefined;
    return outcome;
  } finally {
    if (child) process.kill(child);
    rmSync(work, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
  }
}

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

it("fails a command that hits its timeout even when the process itself exited 0", () => {
  const outcome = runLeavingAChild(1_000);

  assert.match(outcome.stdout, /"started":\d+/);
  assert.equal(outcome.code, -1);
});

it("returns when the process exits and keeps its output when an output file is given, while its child keeps running", () => {
  const outcome = runLeavingAChild(20_000, "start.txt");

  assert.equal(outcome.code, 0);
  assert.match(outcome.stdout, /"started":\d+/);
});

for (const mode of ["pass", "stop-failure", "scenario-and-stop-failure", "start-failure", "start-cleanup-failure", "abort"] as const) {
  it(`client init preserves the selected origin, summary and fixture ownership on ${mode}`, async t => {
    const work = mkdtempSync(path.join(realpathSync.native(tmpdir()), "smoke-caller-"));
    t.after(() => rmSync(work, { recursive: true, force: true }));
    const source = ts.createSourceFile("caller.ts", readFileSync(new URL("./rehearse-client-init-smoke.ts", import.meta.url), "utf8"), ts.ScriptTarget.Latest, true);
    const target = source.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === "runSmoke");
    assert.ok(target);
    const code = ts.transpileModule(target.getText(source), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
    const events: string[] = [];
    const summaries: { failure?: string; steps: { step: string; result: string }[] }[] = [];
    const processFixture = Object.assign(new EventEmitter(), { platform: process.platform });
    const origin = "http://127.0.0.1:49231";
    const context = {
      AbortController, Error, Date, path, realpathSync, mkdtempSync, tmpdir, randomBytes, Run, Smoke, REPO: work,
      process: processFixture, newToken: () => ({ plain: "private-fixture", hash: "hash" }),
      osLabel: () => "fixture", measureEnvironment: () => ({}), seedTemplates: () => COMMIT,
      bootstrapSmokeTemplates: () => {}, createFixtureUser: () => "fixture-user",
      deleteFixtureUser: () => { events.push("delete"); }, createRepository: () => work,
      installPlugin: () => ({ root: work, commit: COMMIT }), pluginVersionAt: () => "1.0.0",
      summarize: (record: unknown) => record, containsSecret: () => false,
      console: { error: () => {}, log: (text: string) => summaries.push(JSON.parse(text)) },
      startSmokeServer: async ({ signal }: { signal: AbortSignal }) => {
        events.push("start");
        if (mode === "abort") { processFixture.emit("SIGTERM"); signal.throwIfAborted(); }
        if (mode.startsWith("start-")) throw Object.assign(new Error("startup"), { cleanupFailed: mode === "start-cleanup-failure" });
        return { origin, child: { exitCode: null }, stop: async () => {
          events.push("stop");
          if (mode.includes("stop-failure")) throw new Error("stop");
        } };
      },
      newUser: async (smoke: Smoke) => {
        assert.equal(smoke.origin, origin);
        assert.equal(smoke.helperEnv.HARNESS_SERVER, origin);
        for (const name of ["DATABASE_URL", "TEST_DATABASE_URL", "HARNESS_PLAN", "HARNESS_TEMPLATES_DIR"]) assert.equal(smoke.helperEnv[name], undefined);
        if (mode === "scenario-and-stop-failure") await smoke.run.step("scenario", () => { throw new Error("scenario"); });
      },
    };
    const invoke = runInNewContext(code + "\nrunSmoke", context) as (options: unknown, database: string, env: NodeJS.ProcessEnv) => Promise<number>;
    const codeResult = await invoke({ client: "claude", scenario: "new-user", pluginCommit: COMMIT }, "fixture-db", { NODE_ENV: "test", RUNNER_TEMP: work, DATABASE_URL: "private-db", TEST_DATABASE_URL: "private-test-db", HARNESS_PLAN: "max", HARNESS_TEMPLATES_DIR: "private" });
    assert.equal(codeResult, mode === "pass" ? 0 : 1);
    assert.equal(summaries.length, 1);
    assert.equal(processFixture.listenerCount("SIGINT") + processFixture.listenerCount("SIGTERM"), 0);
    assert.equal(events.includes("delete"), ["pass", "start-failure", "abort"].includes(mode));
    if (mode === "pass") assert.deepEqual(events, ["start", "stop", "delete"]);
    if (mode === "scenario-and-stop-failure") assert.equal(summaries[0].failure, "scenario");
    if (mode === "stop-failure") assert.equal(summaries[0].failure, "server-cleanup");
    if (mode.startsWith("start-") || mode === "abort") assert.equal(summaries[0].failure, "server-start");
    if (mode.includes("cleanup-failure") || mode.includes("stop-failure")) assert.ok(summaries[0].steps.some(step => step.step === "server-cleanup" && step.result === "fail"));
  });
}

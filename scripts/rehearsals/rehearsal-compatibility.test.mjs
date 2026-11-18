import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { it } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { require as tsxRequire } from "tsx/cjs/api";
import { repositoryRoot } from "./support/repository-root.mjs";

const legacy = tsxRequire("./rehearse-client-init-smoke.ts", import.meta.url);
const { Run } = tsxRequire("./support/command-run.ts", import.meta.url);
const { createFixtureUser, deleteFixtureUser } = tsxRequire("./support/smoke-database.ts", import.meta.url);
const { seedTemplates, bootstrapSmokeTemplates } = tsxRequire("./support/template-fixture.ts", import.meta.url);
const { createRepository, osLabel } = tsxRequire("./support/repository-fixture.ts", import.meta.url);
const { Smoke, installPlugin, newUser } = tsxRequire("./client-init/claude-connection.ts", import.meta.url);
const { parseArguments, USAGE } = tsxRequire("./client-init/options.ts", import.meta.url);

const require = createRequire(import.meta.url);
const loader = pathToFileURL(require.resolve("tsx")).href;
const loaderDirectory = path.dirname(require.resolve("tsx"));
const pipeModules = readdirSync(loaderDirectory).filter(name => /^get-pipe-path-.*\.cjs$/.test(name));
assert.equal(pipeModules.length, 1);
const pipeModule = await import(pathToFileURL(path.join(loaderDirectory, pipeModules[0])).href);
const loaderPipe = pipeModule.getPipePath(process.pid);
const compiler = require.resolve("@esbuild/" + process.platform + "-" + process.arch
  + (process.platform === "win32" ? "/esbuild.exe" : "/bin/esbuild"));
const GUARD = [
  'const fs = require("node:fs"), cp = require("node:child_process"), net = require("node:net");',
  'const block = name => { process.stderr.write("CVO1_SIDE_EFFECT:" + name + "\\n"); throw new Error("Unexpected side effect"); };',
  'for (const name of ["spawn", "spawnSync", "exec", "execSync", "execFile", "execFileSync", "fork"]) {',
  '  const original = cp[name];',
  '  cp[name] = function (...args) {',
  '    if (name === "spawn" && args[0] === process.env.CVO1_COMPILER && Array.isArray(args[1]) && args[1].length === 2 && /^--service=/.test(args[1][0]) && args[1][1] === "--ping") return original.apply(this, args);',
  '    return block("process:" + name);',
  '  };',
  '}',
  'const mutations = ["writeFile", "appendFile", "mkdir", "mkdtemp", "rm", "rmdir", "unlink", "rename", "copyFile", "cp", "chmod", "chown", "link", "symlink", "truncate"];',
  'for (const name of mutations) {',
  '  for (const method of [name, name + "Sync"]) if (typeof fs[method] === "function") fs[method] = () => block("file:" + method);',
  '  if (typeof fs.promises[name] === "function") fs.promises[name] = () => block("file:" + name);',
  '}',
  'const writable = flags => typeof flags === "number" ? flags & (fs.constants.O_WRONLY | fs.constants.O_RDWR | fs.constants.O_CREAT | fs.constants.O_TRUNC | fs.constants.O_APPEND) : /[wa+]/.test(flags ?? "r");',
  'for (const owner of [fs, fs.promises]) for (const method of ["open", "openSync"]) if (typeof owner[method] === "function") {',
  '  const original = owner[method];',
  '  owner[method] = function (...args) { if (writable(args[1])) return block("file:" + method); return original.apply(this, args); };',
  '}',
  'net.Socket.prototype.connect = function (...args) {',
  '  const options = Array.isArray(args[0]) ? args[0][0] : args[0];',
  '  const pipe = typeof options === "string" ? options : options?.path;',
  '  if (pipe === process.env.CVO1_LOADER_PIPE) { queueMicrotask(() => this.emit("error", Object.assign(new Error("No test loader parent"), { code: "ENOENT" }))); return this; }',
  '  return block("network:connect");',
  '};',
  'net.Server.prototype.listen = () => block("network:listen");',
  'globalThis.fetch = () => block("network:fetch");',
  'require("node:module").syncBuiltinESMExports();',
].join("\n");

function fixture(t) {
  const work = mkdtempSync(path.join(realpathSync.native(tmpdir()), "cvo1-compatibility-"));
  t.after(() => rmSync(work, { recursive: true, force: true }));
  const guard = path.join(work, "guard.cjs");
  writeFileSync(guard, GUARD);
  const env = {
    ...process.env,
    CI: "false", DATABASE_URL: "invalid-fixture-url", TEST_DATABASE_URL: "",
    TSX_DISABLE_CACHE: "1", TSX_TSCONFIG_PATH: path.join(repositoryRoot, "tsconfig.json"),
    CVO1_COMPILER: compiler,
    CVO1_LOADER_PIPE: loaderPipe,
  };
  for (const name of ["NODE_OPTIONS", "NODE_COMPILE_CACHE", "ESBUILD_BINARY_PATH"]) delete env[name];
  return {
    work,
    run: args => spawnSync(process.execPath, ["--require", guard, "--import", loader, ...args], {
      cwd: work, env, encoding: "utf8", timeout: 30_000,
    }),
  };
}

it("keeps the legacy runtime exports and their original implementation identity", () => {
  const expected = {
    USAGE, parseArguments, Run, Smoke, osLabel, installPlugin, createRepository, newUser,
    seedTemplates, bootstrapSmokeTemplates, createFixtureUser, deleteFixtureUser,
  };
  assert.deepEqual(Object.keys(legacy).sort(), [...Object.keys(expected), "main"].sort());
  for (const [name, value] of Object.entries(expected)) assert.equal(legacy[name], value, name);
  assert.equal(typeof legacy.main, "function");
  assert.equal(repositoryRoot, realpathSync.native(fileURLToPath(new URL("../../", import.meta.url))));
});

it("proves the observer detects file, process and connection effects", t => {
  const f = fixture(t), canary = path.join(f.work, "must-not-exist");
  const controls = [
    ["file:", 'require("node:fs").writeFileSync(' + JSON.stringify(canary) + ', "changed")'],
    ["process:", 'require("node:child_process").spawnSync(process.execPath, ["--version"])'],
    ["network:", 'require("node:net").connect({host:"127.0.0.1",port:1})'],
  ];
  for (const [event, code] of controls) {
    const result = f.run(["--input-type=commonjs", "-e", code]);
    assert.ifError(result.error);
    assert.notEqual(result.status, 0);
    assert.ok(result.stderr.includes("CVO1_SIDE_EFFECT:" + event), result.stderr);
  }
  assert.equal(existsSync(canary), false);
});

it("imports all current entrypoints and extracted modules from another cwd without effects", { timeout: 60_000 }, t => {
  const f = fixture(t);
  const paths = [
    "rehearse-client-init-smoke.ts", "rehearse-pipeline-smoke.ts",
    "rehearse-codex-macos.mjs", "rehearse-shared-distribution.mjs",
    "support/command-run.ts", "support/smoke-database.ts", "support/template-fixture.ts",
    "support/repository-fixture.ts", "support/repository-root.mjs",
    "client-init/options.ts", "client-init/claude-connection.ts",
  ];
  for (const name of paths) {
    const source = "await import(" + JSON.stringify(new URL(name, import.meta.url).href) + '); console.log("CVO1_IMPORTED");';
    const result = f.run(["--input-type=module", "-e", source]);
    assert.ifError(result.error);
    assert.equal(result.status, 0, name + ": " + result.stderr);
    assert.match(result.stdout, /CVO1_IMPORTED/);
    assert.doesNotMatch(result.stderr, /CVO1_SIDE_EFFECT:/);
  }
});

it("reaches help and argument refusal instead of failing module resolution in another cwd", t => {
  const f = fixture(t);
  for (const name of ["rehearse-client-init-smoke.ts", "rehearse-pipeline-smoke.ts"]) {
    const script = fileURLToPath(new URL(name, import.meta.url));
    for (const [args, status] of [[["--help"], 0], [["--unknown"], 2]]) {
      const result = f.run([script, ...args]);
      assert.ifError(result.error);
      assert.equal(result.status, status, result.stderr);
      assert.match(result.stdout + result.stderr, /usage:/i);
      assert.doesNotMatch(result.stderr, /CVO1_SIDE_EFFECT:|MODULE_NOT_FOUND/);
    }
  }
  for (const name of ["rehearse-codex-macos.mjs", "rehearse-shared-distribution.mjs"]) {
    const result = f.run([fileURLToPath(new URL(name, import.meta.url))]);
    assert.ifError(result.error);
    assert.equal(result.status, 1, result.stderr);
    assert.doesNotMatch(result.stderr, /CVO1_SIDE_EFFECT:|MODULE_NOT_FOUND/);
  }
});

it("preserves seed arguments, checkout cwd, timeout, revision parsing and command failure", t => {
  const f = fixture(t), run = new Run(path.join(f.work, "seed.log")), calls = [];
  const revision = "a".repeat(40), templates = path.join(f.work, "templates"), snapshot = path.join(f.work, "snapshot.json");
  const env = { DATABASE_URL: "fixture-db" };
  run.succeed = (...args) => { calls.push(args); return { code: 0, stdout: "done: 13 templates atomically seeded from " + revision, stderr: "" }; };
  assert.equal(seedTemplates(run, templates, snapshot, env), revision);
  assert.deepEqual(calls, [[process.execPath,
    ["--import", "tsx", "scripts/templates/seed-templates.ts", "--dir", templates, "--snapshot", snapshot],
    repositoryRoot, env, "seed:templates", 300_000]]);
  run.succeed = () => ({ code: 0, stdout: "no revision", stderr: "" });
  assert.throws(() => seedTemplates(run, templates, snapshot, env), /did not report a template revision/);
  const failed = new Error("seed process failed");
  run.succeed = () => { throw failed; };
  assert.throws(() => seedTemplates(run, templates, snapshot, env), error => error === failed);
  assert.equal(existsSync(snapshot), false);
});

for (const mode of ["pass", "existing-snapshot", "refused", "api-error"]) {
  it("preserves the template bootstrap boundary on " + mode, async t => {
    const f = fixture(t), run = new Run(path.join(f.work, "bootstrap.log"));
    const file = fileURLToPath(new URL("./support/template-fixture.ts", import.meta.url));
    const source = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
    const declaration = source.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === "bootstrapSmokeTemplates");
    assert.ok(declaration);
    const compiled = ts.transpileModule(declaration.getText(source), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    const snapshot = { hash: "f".repeat(64), data: { templates: [{ lang: "en", path: "agents/dev.md" }] } };
    const database = {}, connections = [], commands = [], failure = new Error("bootstrap API failed");
    const databaseUrl = "postgresql://fixture.invalid/stagekeeper_test_fixture";
    const exports = {};
    const modules = new Map([
      [path.resolve(path.dirname(file), "../../lib/prisma"), {
        withPrisma: async (operation, url) => { connections.push(url); return operation(database); },
      }],
      [path.resolve(path.dirname(file), "../../../src/server/templates/api"), {
        snapshotTemplateCutover: async db => { assert.equal(db, database); return snapshot; },
        bootstrapTemplateReleases: async (db, command) => {
          assert.equal(db, database);
          commands.push(command);
          if (mode === "api-error") throw failure;
          return { ok: mode !== "refused" };
        },
      }],
    ]);
    runInNewContext(compiled, {
      exports, path, writeFileSync,
      require: specifier => {
        const key = path.resolve(path.dirname(file), specifier);
        assert.ok(modules.has(key), "Unexpected dynamic import " + specifier);
        return modules.get(key);
      },
    });
    const target = path.join(f.work, "private-cutover-snapshot.json");
    if (mode === "existing-snapshot") writeFileSync(target, "preserved");
    const input = { databaseUrl, run, work: f.work, codeSha: "b".repeat(40), requestId: "fixture-request", workflowRun: "fixture-run" };
    const invoke = () => exports.bootstrapSmokeTemplates(input);
    if (mode === "pass") await invoke();
    else await assert.rejects(invoke(), error => mode === "api-error" ? error === failure
      : mode === "existing-snapshot" ? error.code === "EEXIST" : /Smoke template bootstrap refused/.test(error.message));
    assert.deepEqual(connections, [databaseUrl]);
    assert.deepEqual(run.steps, [{ step: "template-cutover", result: mode === "pass" ? "pass" : "fail" }]);
    assert.equal(run.failure, mode === "pass" ? undefined : "template-cutover");
    if (mode === "existing-snapshot") {
      assert.equal(readFileSync(target, "utf8"), "preserved");
      assert.deepEqual(commands, []);
    } else {
      assert.deepEqual(JSON.parse(readFileSync(target, "utf8")), snapshot);
      if (process.platform !== "win32") assert.equal(statSync(target).mode & 0o777, 0o600);
      assert.deepEqual(JSON.parse(JSON.stringify(commands)), [{
        requestId: input.requestId,
        audit: { actor: "client-smoke", environment: "test", targetProfileId: "isolated-smoke",
          targetIdentityHash: "0".repeat(64), codeSha: input.codeSha, workflowRun: input.workflowRun },
        evidence: { schemaVersion: 1, snapshotHash: snapshot.hash, codeSha: input.codeSha,
          targetIdentityHash: "0".repeat(64), maintenanceReference: "isolated smoke before any role RPC writers",
          writersDrained: true, readers: [{ identity: "isolated-next-server", codeSha: input.codeSha, protocol: "template-release-v1" }],
          inventory: snapshot.data.templates, excluded: [], unboundRuns: [] },
      }]);
    }
  });
}

import assert from "node:assert/strict";
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { closeSync, cpSync, existsSync, lstatSync, mkdirSync, openSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync, writeFileSync, writeSync } from "node:fs";
import path from "node:path";
import { release } from "node:os";
import { fileURLToPath } from "node:url";
import { validateTestDatabase } from "../lib/test-database.mjs";
import { parseToolResponse } from "../../plugin/runtime/execution/watch.mjs";
import { startSmokeServer } from "./smoke-server.mjs";
import { ACCEPTANCE_CODEX_ARCHIVES, ACCEPTANCE_CODEX_VERSION, acceptanceClientEnvironment, distributionDigest,
  nativeBundleCommand, requireAcceptanceCi, selectedCodexCache, verifyInstalledBundle } from "./shared-distribution-contract.mjs";

const repository = fileURLToPath(new URL("../../", import.meta.url));
const previousCommit = "85c66fb1d9e02c3d9416710240cbfca3f0023939";
const templateCommit = "8ccb37a4ab91de527e6a23caa6d415c7cdc6f215";
const marketplaceName = "stagekeeper-shared-acceptance";
const pluginId = "harness@" + marketplaceName;

export function distributionArguments(args) {
  const options = {};
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index];
    assert.ok(["--runtime", "--templates", "--previous", "--evidence"].includes(key) && !Object.hasOwn(options, key), "Invalid acceptance arguments");
    assert.ok(path.isAbsolute(args[index + 1] ?? ""), "Absolute acceptance paths are required");
    options[key] = args[index + 1];
  }
  assert.equal(Object.keys(options).length, 4, "Runtime, templates, previous source and evidence paths are required");
  return { runtime: options["--runtime"], templates: options["--templates"], previous: options["--previous"], evidence: options["--evidence"] };
}

function git(root, args) {
  return execFileSync("git", ["-C", root, ...args], { encoding: "utf8", windowsHide: true, stdio: ["ignore", "pipe", "pipe"] }).trim();
}

function lastJson(output) {
  function parse(value) {
    try { return JSON.parse(value); }
    catch (error) { if (error instanceof SyntaxError) return undefined; throw error; }
  }
  const entire = parse(output.trim());
  if (entire !== undefined) return entire;
  const value = output.trim().split(/\r?\n/).reverse().map(line => parse(line.trim())).find(item => item !== undefined);
  assert.ok(value !== undefined, "Missing structured command result");
  return value;
}

function managedBytes(root) {
  const result = {};
  function visit(directory, prefix = "") {
    for (const name of readdirSync(directory).sort()) {
      if (name === ".git") continue;
      const file = path.join(directory, name), relative = prefix ? prefix + "/" + name : name;
      const stat = lstatSync(file);
      assert.equal(stat.isSymbolicLink(), false);
      if (stat.isDirectory()) visit(file, relative);
      else result[relative] = distributionDigest(readFileSync(file));
    }
  }
  visit(root);
  return result;
}

async function downloadCodex(work) {
  const item = ACCEPTANCE_CODEX_ARCHIVES[`${process.platform}-${process.arch}`];
  const archive = path.join(work, "codex.tar.gz"), output = path.join(work, "codex-cli");
  const url = `https://github.com/openai/codex/releases/download/rust-v${ACCEPTANCE_CODEX_VERSION}/codex-package-${item.target}.tar.gz`;
  const response = await fetch(url, { signal: AbortSignal.timeout(180000) });
  assert.ok(response.ok && response.body, "Codex archive download failed");
  const file = openSync(archive, "wx", 0o600), hash = createHash("sha256");
  let bytes = 0;
  try {
    for await (const chunk of response.body) {
      bytes += chunk.length;
      assert.ok(bytes <= item.bytes, "Codex archive exceeds its pinned size");
      hash.update(chunk); writeSync(file, chunk);
    }
  } finally { closeSync(file); }
  assert.equal(bytes, item.bytes); assert.equal(hash.digest("hex"), item.sha256);
  assert.equal(distributionDigest(readFileSync(archive)), item.sha256);
  const binaryName = process.platform === "win32" ? "codex.exe" : "codex";
  const entries = execFileSync("tar", ["-tzf", archive], { encoding: "utf8", windowsHide: true, maxBuffer: 16 * 1024 * 1024 }).split(/\r?\n/);
  const candidates = entries.filter(name => name === `bin/${binaryName}` || name.endsWith(`/bin/${binaryName}`));
  assert.equal(candidates.length, 1, "Expected one CLI executable in the pinned archive");
  assert.ok(!path.isAbsolute(candidates[0]) && !candidates[0].split(/[\\/]/).includes(".."));
  mkdirSync(output);
  execFileSync("tar", ["-xzf", archive, "-C", output], { stdio: "pipe", windowsHide: true });
  const executable = path.join(output, candidates[0]);
  assert.ok(existsSync(executable), "Pinned Codex archive has no expected executable");
  return executable;
}

async function main() {
  requireAcceptanceCi(process.env);
  const options = distributionArguments(process.argv.slice(2));
  const database = validateTestDatabase(process.env), dbUrl = new URL(database);
  assert.ok(["127.0.0.1", "localhost"].includes(dbUrl.hostname), "Loopback test database required");
  const temporary = realpathSync.native(process.env.RUNNER_TEMP);
  const relative = path.relative(temporary, options.evidence);
  assert.ok(relative && !relative.startsWith("..") && !path.isAbsolute(relative) && !existsSync(options.evidence), "Use a new runner-owned evidence directory");
  const sourceCommit = git(repository, ["rev-parse", "HEAD"]);
  assert.equal(git(options.previous, ["rev-parse", "HEAD"]), previousCommit);
  assert.equal(git(options.templates, ["rev-parse", "HEAD"]), templateCommit);
  for (const root of [repository, options.previous, options.templates]) assert.equal(git(root, ["status", "--porcelain", "--untracked-files=all"]), "", "Acceptance source is dirty");
  assert.equal(git(repository, ["diff", "--name-only", previousCommit, sourceCommit, "--", "prisma/schema.prisma", "prisma/migrations",
    "plugin/runtime/macos/sandbox-identity.c", "scripts/windows/build-windows-role-node.ps1", "scripts/windows/windows-role-runtime-cache.mjs"]), "", "Previous server schema or runtime requires a separate migration");
  mkdirSync(options.evidence, { mode: 0o700 });
  const work = realpathSync.native(options.evidence), privateRoot = path.join(work, "private");
  mkdirSync(privateRoot, { mode: 0o700 });
  const summary = { format: "stagekeeper-shared-distribution-acceptance-v1", sourceCommit, previousCommit, templatesCommit: templateCommit,
    runId: process.env.GITHUB_RUN_ID, attempt: Number(process.env.GITHUB_RUN_ATTEMPT), triggerCommit: process.env.GITHUB_SHA,
    os: process.platform, osVersion: process.platform === "darwin" ? execFileSync("/usr/bin/sw_vers", ["-productVersion"], { encoding: "utf8" }).trim() : release(),
    architecture: process.arch, node: process.version, client: "codex", clientVersion: ACCEPTANCE_CODEX_VERSION,
    modelCalls: 0, checks: [], cleanup: {}, result: "running" };
  const save = () => writeFileSync(path.join(work, "summary.json"), JSON.stringify(summary, null, 2) + "\n", { mode: 0o600 });
  let stage = "prepare", sequence = 0, activeServer, completed = false, cleanupUnconfirmed = false;
  const users = [], fixtures = [], sessions = [], profiles = [];
  function command(label, file, args, { cwd = repository, env = process.env, input, expected = 0, timeout = 300000 } = {}) {
    stage = label;
    const result = spawnSync(file, args, { cwd, env, input, encoding: "utf8", windowsHide: true, timeout, maxBuffer: 16 * 1024 * 1024 });
    writeFileSync(path.join(privateRoot, `${++sequence}-${label}.json`), JSON.stringify({ code: result.status, stdout: result.stdout, stderr: result.stderr, error: result.error?.code }), { mode: 0o600 });
    if (result.error && result.pid) cleanupUnconfirmed = true;
    if (result.error || expected !== "failure" && result.status !== expected) summary.commandFailure = {
      stage: label, exit: result.status, signal: result.signal,
      code: result.error?.code ?? /\b(?:ERR_MODULE_NOT_FOUND|MODULE_NOT_FOUND|ENOENT|EACCES|EPERM|PrismaClientValidationError)\b/.exec(result.stderr ?? "")?.[0] ?? "command-failed",
    };
    assert.equal(result.error, undefined, "Acceptance command did not finish");
    if (expected === "failure") assert.notEqual(result.status, 0, "Expected command refusal");
    else assert.equal(result.status, expected, "Acceptance command failed");
    return result.stdout ?? "";
  }
  function passed(name) { summary.checks.push(name); save(); console.log(JSON.stringify({ stage: name, result: "pass" })); }
  const { withPrisma } = await import("../lib/prisma.ts");
  const { createFixtureUser, createRepository } = await import("./rehearse-client-init-smoke.ts");
  const { newToken } = await import("../../src/server/tokens/api.ts");
  const { changeUserPlan } = await import("../../src/server/projects/api.ts");
  const db = action => withPrisma(action, database);
  try {
    const oldLib = git(repository, ["ls-tree", "-r", "--name-only", previousCommit, "--", "plugin/lib"]).split("\n");
    const currentLib = new Set(git(repository, ["ls-files", "--", "plugin/lib"]).split("\n"));
    const removed = oldLib.filter(file => !currentLib.has(file)).map(file => file.slice("plugin/lib/".length));
    const removedFile = path.join(work, "removed-lib.json"); writeFileSync(removedFile, JSON.stringify(removed));
    const snapshotScript = path.join(repository, "scripts/rehearsals/shared-template-snapshot.mjs");
    const snapshot = (root, kind) => lastJson(command("template-contract-" + kind, process.execPath,
      ["--import", "tsx", snapshotScript, root, options.templates, templateCommit, kind, removedFile],
      { cwd: root, env: { ...process.env, TSX_TSCONFIG_PATH: path.join(root, "tsconfig.json") } }));
    const beforeContracts = snapshot(options.previous, "previous"), afterContracts = snapshot(repository, "candidate");
    assert.deepEqual(afterContracts, beforeContracts);
    summary.templateContracts = { sourceHash: afterContracts.sourceHash, rows: afterContracts.rows,
      languages: afterContracts.languages, comparedInputs: afterContracts.observations.length, obsoleteReferences: 0,
      contentHash: afterContracts.contentHash, contractHash: afterContracts.contractHash };
    command("private-corpus", process.execPath, ["--import", "tsx", "--test", "tests/templates/private-template-release.test.ts"],
      { env: { ...process.env, HARNESS_RELEASE_SOURCE: options.templates, HARNESS_RELEASE_COMMIT: templateCommit } });
    passed("private-corpus-paths-and-cross-version-hashes");
    const channel = await db(client => client.templateChannel.findUniqueOrThrow({ where: { id: "default" } }));
    assert.equal(channel.mode, "legacy"); assert.equal(channel.legacyWritesBlocked, false); assert.equal(channel.activeReleaseId, null);
    assert.equal(await db(client => client.user.count()), 0);
    const cli = await downloadCodex(work);
    const gitDirectory = process.platform === "win32" ? path.dirname(command("find-git", "where.exe", ["git"]).trim().split(/\r?\n/)[0]) : "/usr/bin";
    const profile = path.join(work, "update-profile"), freshProfile = path.join(work, "fresh-profile");
    mkdirSync(profile); mkdirSync(freshProfile); profiles.push(profile, freshProfile);
    const clientEnv = profileDirectory => acceptanceClientEnvironment({ env: process.env, cliDirectory: path.dirname(cli), profile: profileDirectory, gitDirectory });
    const updateEnv = clientEnv(profile), freshEnv = clientEnv(freshProfile);
    const globalNode = spawnSync(process.platform === "win32" ? "where.exe" : "/bin/sh", process.platform === "win32" ? ["node"] : ["-c", "command -v node"], { env: updateEnv, encoding: "utf8", windowsHide: true });
    assert.notEqual(globalNode.status, 0, "Consumer PATH must not provide global Node");
    assert.equal(command("cli-version", cli, ["--version"], { env: updateEnv }).trim(), `codex-cli ${ACCEPTANCE_CODEX_VERSION}`);
    assert.equal(existsSync(path.join(profile, "auth.json")), false);
    const sourcePackage = process.platform === "darwin" ? "scripts/macos/package-plugin.mjs" : "scripts/windows/package-windows-plugin.mjs";
    const oldBundle = path.join(work, "previous-bundle"), newBundle = path.join(work, "candidate-bundle");
    command("package-previous", process.execPath, [path.join(options.previous, sourcePackage), "--runtime", options.runtime, "--output", oldBundle], { cwd: options.previous });
    command("package-candidate", process.execPath, [sourcePackage, "--runtime", options.runtime, "--output", newBundle]);
    summary.previousPackage = { ...verifyInstalledBundle({ bundle: oldBundle, installed: oldBundle, commit: previousCommit }), kind: "rebuilt-fixture" };
    summary.package = verifyInstalledBundle({ bundle: newBundle, installed: newBundle, commit: sourceCommit });
    const marketplace = path.join(work, "marketplace"), packageRoot = path.join(marketplace, "plugin");
    mkdirSync(path.join(marketplace, ".claude-plugin"), { recursive: true });
    writeFileSync(path.join(marketplace, ".claude-plugin/marketplace.json"), JSON.stringify({ name: marketplaceName, owner: { name: "Sangeok" }, plugins: [{ name: "harness", source: "./plugin" }] }));
    cpSync(oldBundle, packageRoot, { recursive: true });
    function install(label, environment, profileDirectory, bundle, commit, addMarketplace) {
      if (addMarketplace) command(`${label}-marketplace`, cli, ["plugin", "marketplace", "add", marketplace, "--json"], { env: environment });
      const added = lastJson(command(`${label}-install`, cli, ["plugin", "add", pluginId, "--json"], { env: environment }));
      const listing = lastJson(command(`${label}-list`, cli, ["plugin", "list", "--marketplace", marketplaceName, "--json"], { env: environment }));
      const installed = selectedCodexCache({ added, listing, pluginId, profile: profileDirectory });
      verifyInstalledBundle({ bundle, installed, commit });
      return installed;
    }
    const oldInstalled = install("previous", updateEnv, profile, oldBundle, previousCommit, true);
    passed("previous-loader-and-inventory");
    const seed = `const {Run,seedTemplates,bootstrapSmokeTemplates}=await import('./scripts/rehearsals/rehearse-client-init-smoke.ts');
const run=new Run(process.argv[1]); const revision=seedTemplates(run,process.argv[2],process.argv[3],process.env);
if(revision!==process.argv[4])throw Error('template-source');
await bootstrapSmokeTemplates({databaseUrl:process.env.DATABASE_URL,run,work:process.argv[5],codeSha:process.argv[6],requestId:'shared-acceptance',workflowRun:process.env.GITHUB_RUN_ID});`;
    command("previous-seed", process.execPath, ["--import", "tsx", "--input-type=module", "-e", seed,
      path.join(privateRoot, "seed.log"), options.templates, path.join(privateRoot, "template-snapshot.json"), templateCommit, privateRoot, previousCommit],
    { cwd: options.previous, env: { ...process.env, DATABASE_URL: database } });
    const port = 45438;
    const oldNext = path.join(options.previous, "node_modules/next/dist/bin/next");
    activeServer = await startSmokeServer({ databaseUrl: database, log: path.join(privateRoot, "old-server.log"), port }, {
      launch: (file, args, settings) => spawn(file, args.map(value => value.endsWith("node_modules/next/dist/bin/next") || value.endsWith("node_modules\\next\\dist\\bin\\next") ? oldNext : value), { ...settings, cwd: options.previous }),
    });
    const origin = activeServer.origin;
    const token = newToken("user"), userId = await createFixtureUser(`smb-${randomUUID().slice(0, 8)}`, token.hash, database);
    users.push(userId);
    await db(client => changeUserPlan(client, { userId, plan: "max", note: "GitHub shared distribution acceptance" }));
    function helper(bundle, repo, environment, task, args, expected = 0) {
      const invocation = nativeBundleCommand(bundle, task, [...args, "--root", repo]);
      return command(`${task}-${++sequence}`, invocation.file, invocation.args, { cwd: repo, env: environment, expected });
    }
    async function connection(label, bundle, environment) {
      const directory = path.join(work, label); mkdirSync(directory);
      const repo = createRepository(directory, `shared-${label}-${randomUUID().slice(0, 8)}`); fixtures.push(repo);
      const env = { ...environment, HARNESS_TOKEN: token.plain, HARNESS_SERVER: origin };
      const project = lastJson(helper(bundle, repo, env, "init", ["--register", "--client", "codex"]));
      writeFileSync(path.join(repo, "harness.json"), JSON.stringify({ version: 1, project, language: "en",
        workspaces: [{ id: "app", path: ".", agent: "app-dev", verify: ["npm test"] }] }, null, 2) + "\n");
      const before = managedBytes(repo);
      helper(bundle, repo, env, "init", ["--client", "codex", "--dry-run"]);
      assert.deepEqual(managedBytes(repo), before);
      helper(bundle, repo, env, "init", ["--client", "codex"]);
      assert.equal(lastJson(helper(bundle, repo, env, "codex", ["complete-init"])).event, "connected");
      git(repo, ["add", "-A"]); git(repo, ["commit", "-qm", "Record installed acceptance fixture"]);
      return { repo, env, project };
    }
    const previous = await connection("update", oldInstalled, updateEnv);
    const probe = `import {pathToFileURL} from 'node:url';import path from 'node:path';
const api=await import(pathToFileURL(path.join(process.argv[1],'runtime/mcp-client.mjs')).href);
const input=api.connectionInput(process.argv[2],{client:'codex'});const operation=JSON.parse(process.argv[3]);
const value=operation.raw?await api.mcpRequest(input,'tools/call',{name:'agent_next',arguments:{project:input.config.project.slug,client:'codex',...operation.args,installation:{...input.installation,clientSurfaceHash:'0'.repeat(64)}}}):await api.callTool(input,operation.name,operation.args);
console.log(JSON.stringify(value));`;
    function call(bundle, connected, operation) {
      const node = path.join(bundle, process.platform === "win32" ? "runtime/windows/node/node.exe" : "runtime/macos/node/bin/node");
      return lastJson(command("installed-mcp", node, ["--input-type=module", "-e", probe, bundle, connected.repo, JSON.stringify(operation)], { cwd: connected.repo, env: connected.env }));
    }
    const role = { agent: "doc-auditor", execution: { kind: "standalone" } };
    const opened = call(oldInstalled, previous, { name: "agent_next", args: role });
    stage = "previous-agent-pin";
    summary.pinObservation = { done: opened.done, receipt: Boolean(opened.receipt), release: Boolean(opened.templateRelease), instruction: typeof opened.instruction === "string" };
    assert.equal(opened.done, false); assert.ok(opened.receipt && opened.templateRelease && typeof opened.instruction === "string");
    const projectRow = await db(client => client.project.findUniqueOrThrow({ where: { slug: previous.project.slug } }));
    const pinState = () => db(client => client.agentRun.findMany({ where: { projectId: projectRow.id }, orderBy: { id: "asc" },
      select: { id: true, agent: true, stepId: true, revision: true, templateReleaseId: true, templateLanguage: true, templatePinOrigin: true, closedAt: true,
        steps: { orderBy: { id: "asc" }, select: { id: true, stepId: true, outcome: true, accepted: true } } } }));
    const pinned = await pinState(), files = managedBytes(previous.repo);
    assert.ok(pinned.length > 0);
    await activeServer.stop(); activeServer = undefined;
    activeServer = await startSmokeServer({ databaseUrl: database, log: path.join(privateRoot, "candidate-server.log"), port });
    assert.equal(activeServer.origin, origin);
    const resumed = call(oldInstalled, previous, { name: "agent_next", args: role });
    assert.deepEqual(resumed.receipt, opened.receipt); assert.equal(resumed.instruction, opened.instruction);
    assert.deepEqual(resumed.templateRelease, opened.templateRelease);
    assert.deepEqual(await pinState(), pinned); assert.deepEqual(managedBytes(previous.repo), files);
    const refusal = call(oldInstalled, previous, { raw: true, args: { ...role, outcome: "ok", receipt: opened.receipt } });
    const parsed = parseToolResponse(refusal.contentType, refusal.body, refusal.id);
    assert.equal(parsed.ok, false); assert.equal(parsed.error.code, "access-refused");
    assert.deepEqual(await pinState(), pinned);
    passed("previous-plugin-new-server-pins-and-refusal");
    renameSync(packageRoot, path.join(work, "previous-marketplace")); cpSync(newBundle, packageRoot, { recursive: true });
    const installed = install("candidate", updateEnv, profile, newBundle, sourceCommit, false);
    const beforeUpdate = managedBytes(previous.repo);
    helper(installed, previous.repo, previous.env, "init", ["--client", "codex", "--dry-run"]);
    assert.deepEqual(managedBytes(previous.repo), beforeUpdate);
    helper(installed, previous.repo, previous.env, "init", ["--client", "codex"]);
    assert.equal(lastJson(helper(installed, previous.repo, previous.env, "codex", ["complete-init"])).event, "connected");
    assert.deepEqual(await pinState(), pinned);
    assert.deepEqual(call(installed, previous, { name: "agent_next", args: role }).receipt, opened.receipt);
    passed("updated-cache-and-preserved-pins");
    assert.equal(readdirSync(freshProfile).length, 0);
    const freshInstalled = install("fresh", freshEnv, freshProfile, newBundle, sourceCommit, true);
    const fresh = await connection("new-user", freshInstalled, freshEnv);
    passed("empty-cache-real-init-and-mcp");
    const changedFile = path.join(fresh.repo, ".codex/agents/app-dev.toml"), original = readFileSync(changedFile);
    const lockFile = path.join(fresh.repo, "harness.lock.json"), originalLock = JSON.parse(readFileSync(lockFile, "utf8"));
    writeFileSync(changedFile, Buffer.concat([original, Buffer.from("\n# acceptance owner edit\n")]));
    helper(freshInstalled, fresh.repo, fresh.env, "init", ["--client", "codex"], "failure");
    const pending = JSON.parse(readFileSync(lockFile, "utf8"));
    assert.equal(pending.clients.codex.state, "pending");
    assert.deepEqual(pending.files[".codex/agents/app-dev.toml"], originalLock.files[".codex/agents/app-dev.toml"]);
    assert.ok(readFileSync(changedFile, "utf8").endsWith("# acceptance owner edit\n"));
    helper(freshInstalled, fresh.repo, fresh.env, "codex", ["prepare", "--commit", "no", "--propose", "no"], "failure");
    writeFileSync(changedFile, original);
    helper(freshInstalled, fresh.repo, fresh.env, "init", ["--client", "codex"]);
    assert.equal(JSON.parse(readFileSync(lockFile, "utf8")).clients.codex.state, "ready");
    passed("modified-file-pending-refusal-and-recovery");
    for (const connected of [previous, fresh]) {
      const bundle = connected === previous ? installed : freshInstalled;
      git(connected.repo, ["add", "-A"]);
      if (git(connected.repo, ["status", "--porcelain"])) git(connected.repo, ["commit", "-qm", "Record verified acceptance update"]);
      const started = lastJson(helper(bundle, connected.repo, connected.env, "session", ["--start", "--client", "codex", "--commit", "no", "--propose", "no"]));
      assert.equal(started.event, "started");
      assert.ok(typeof started.session === "string"); sessions.push({ bundle, connected, session: started.session });
      assert.equal(lastJson(helper(bundle, connected.repo, connected.env, "session", ["--check", "--session", started.session])).event, "owned");
      helper(bundle, connected.repo, connected.env, "session", ["--stop", "--session", started.session]);
      assert.equal(lastJson(helper(bundle, connected.repo, connected.env, "session", ["--release", "--session", started.session])).event, "released");
      sessions.pop();
      const status = lastJson(helper(bundle, connected.repo, connected.env, "background", ["--status"]));
      assert.equal(status.running, false); assert.equal(Boolean(status.held), false);
    }
    assert.equal(existsSync(path.join(profile, "auth.json")), false); assert.equal(existsSync(path.join(freshProfile, "auth.json")), false);
    passed("installed-session-lifecycle-without-model-auth");
    completed = true;
  } catch (error) {
    cleanupUnconfirmed ||= error?.cleanupFailed === true;
    summary.failure = stage;
    summary.error = { name: error?.name, code: error?.code,
      location: /rehearse-shared-distribution\.mjs:\d+:\d+/.exec(error?.stack ?? "")?.[0] };
  } finally {
    const errors = [];
    if (cleanupUnconfirmed) errors.push("process-cleanup-unconfirmed");
    for (const held of sessions) {
      try {
        for (const operation of ["stop", "release"]) {
          const invocation = nativeBundleCommand(held.bundle, "session", ["--" + operation, "--session", held.session, "--root", held.connected.repo]);
          const output = command("cleanup-session-" + operation, invocation.file, invocation.args, { cwd: held.connected.repo, env: held.connected.env });
          if (operation === "release") assert.equal(lastJson(output).event, "released");
        }
      } catch { errors.push("session-unsettled"); }
    }
    try { await activeServer?.stop(); summary.cleanup.server = "pass"; } catch { errors.push("server-stop"); }
    if (errors.length === 0) {
      try {
        for (const id of users) await db(client => client.user.delete({ where: { id } }));
        assert.equal(await db(client => client.user.count({ where: { id: { in: users } } })), 0);
        for (const root of fixtures) rmSync(root, { recursive: true });
        for (const profile of profiles) rmSync(profile, { recursive: true });
        summary.cleanup.fixture = "pass";
        summary.cleanup.client = "pass";
        const { default: pg } = await import("pg");
        const adminUrl = new URL(database); adminUrl.pathname = "/postgres";
        const admin = new pg.Client({ connectionString: adminUrl.href });
        await admin.connect();
        try { await admin.query(`DROP DATABASE "${dbUrl.pathname.slice(1)}"`); } finally { await admin.end(); }
        summary.cleanup.database = "pass";
      } catch { errors.push("fixture-or-database"); }
    }
    summary.cleanup.errors = errors;
    summary.result = completed && errors.length === 0 ? "pass" : "fail";
    save(); console.log(JSON.stringify({ result: summary.result, failure: summary.failure, checks: summary.checks, modelCalls: 0, cleanup: summary.cleanup }));
    if (summary.result !== "pass") process.exitCode = 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    console.error(JSON.stringify({ result: "preflight-failed", name: error?.name, code: error?.code,
      location: /rehearse-shared-distribution\.mjs:\d+:\d+/.exec(error?.stack ?? "")?.[0] }));
    process.exitCode = 1;
  });
}

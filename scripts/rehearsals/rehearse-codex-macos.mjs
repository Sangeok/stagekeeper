import assert from "node:assert/strict";
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, openSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { newToken } from "../../packages/core/tokens/token.mjs";
import { validateTestDatabase } from "../lib/test-database.mjs";
import { BACKLOG_ITEM, FIXTURE_FILES, caseResults } from "./pipeline-smoke-steps.mjs";

const repository = fileURLToPath(new URL("../../", import.meta.url));
const qaOrigin = "http://127.0.0.1:45442", browserPort = 45443;
const lastJson = output => output.trim().split(/\r?\n/).reverse().map(line => { try { return JSON.parse(line); } catch { return null; } }).find(value => value !== null);

export function countResidentModelStarts(log) {
  let count = 0;
  for (const line of log.split(/\r?\n/).filter(Boolean)) {
    const start = line.indexOf("{");
    if (start >= 0 && JSON.parse(line.slice(start)).event === "model-start") count++;
  }
  return count;
}

export function hasSuccessfulRoleRecord(run) {
  if (run.closedAt == null || !Array.isArray(run.steps) || run.steps.some(step => step.accepted === true && ["failed", "blocked"].includes(step.outcome))) return false;
  const terminal = run.agent === "app-dev" && !run.steps.some(step => step.stepId === "implement") ? "plan" : "report";
  return run.steps.some(step => step.accepted === true && step.stepId === terminal && step.outcome === "ok");
}

export function assertIdleObservationGap(previous, current) {
  if (!Number.isFinite(previous) || !Number.isFinite(current) || current < previous || current - previous > 90000) {
    throw new Error("Idle observation was interrupted by a clock change or a sampling gap over 90 seconds");
  }
}

export function parseMacosRehearsalArguments(args) {
  const values = {}, allowed = new Set(["--package", "--templates", "--work", "--browser-cli", "--idle-minutes"]);
  let models = false;
  for (let index = 0; index < args.length; index++) {
    const name = args[index];
    if (name === "--run-models" && !models) { models = true; continue; }
    if (!allowed.has(name) || Object.hasOwn(values, name) || !args[index + 1] || args[index + 1].startsWith("--")) throw new Error("Invalid Codex macOS rehearsal arguments");
    values[name] = args[++index];
  }
  if (!models) throw new Error("Explicit --run-models is required");
  for (const name of ["--package", "--templates", "--work", "--browser-cli"]) if (!path.isAbsolute(values[name] ?? "")) throw new Error(`${name} must be absolute`);
  const idleMinutes = Number(values["--idle-minutes"] ?? 0);
  if (!Number.isInteger(idleMinutes) || idleMinutes < 0 || idleMinutes > 120) throw new Error("idle-minutes must be from 0 through 120");
  return { packageRoot: values["--package"], templates: values["--templates"], work: values["--work"], browserCli: values["--browser-cli"], idleMinutes };
}

async function main(args) {
  if (process.platform !== "darwin") throw new Error("Run this acceptance on a real macOS host");
  const options = parseMacosRehearsalArguments(args), databaseUrl = validateTestDatabase(process.env);
  if (!databaseUrl || !["127.0.0.1", "localhost"].includes(new URL(databaseUrl).hostname)) throw new Error("A loopback stagekeeper_test_* database is required");
  if (existsSync(options.work) || !existsSync(path.join(repository, ".next/BUILD_ID"))) throw new Error("Use a new private evidence directory and a fresh production build");
  const evidenceParent = realpathSync(path.dirname(options.work)), relativeEvidence = path.relative(repository, path.join(evidenceParent, path.basename(options.work)));
  if (relativeEvidence !== ".." && !relativeEvidence.startsWith(".." + path.sep) && !path.isAbsolute(relativeEvidence)) throw new Error("Private acceptance evidence must stay outside the repository");
  mkdirSync(options.work, { mode: 0o700 });
  const work = realpathSync(options.work), repo = path.join(work, "repo"), artifacts = path.join(work, "browser");
  mkdirSync(repo); mkdirSync(artifacts); mkdirSync(path.join(work, "codex-config"));
  process.env.DATABASE_URL = databaseUrl;
  const { withPrisma } = await import("../lib/prisma.ts");
  const { createBoardService, loadPipelinesView, savePipelineDefinition, nextFor, headFor, preparePipelineRun, startProjectWork, stopProjectWork, setAutomaticScout } = await import("../../src/server/pipeline/api.ts");
  const { changeUserPlan } = await import("../../src/server/projects/api.ts");
  const { Run, seedTemplates, bootstrapSmokeTemplates, createFixtureUser, deleteFixtureUser, startServer, stopServer, ORIGIN } = await import("./rehearse-client-init-smoke.ts");
  const { installedMacosRuntime } = await import(pathToFileURL(path.join(options.packageRoot, "runtime/macos-runtime.mjs")).href);
  const { codexExecutable } = await import(pathToFileURL(path.join(options.packageRoot, "runtime/codex-executable.mjs")).href);
  const runtime = installedMacosRuntime(path.join(options.packageRoot, "runtime/macos/node")), cli = codexExecutable();
  const token = newToken("user"), login = `macos-${randomUUID().slice(0, 8)}`;
  const environment = { ...process.env, DATABASE_URL: databaseUrl, TEST_DATABASE_URL: databaseUrl };
  const helperEnv = { ...environment, PATH: `${path.dirname(cli.executable)}:/usr/bin:/bin`, HARNESS_TOKEN: token.plain, HARNESS_SERVER: ORIGIN, CODEX_HOME: path.join(work, "codex-config") };
  delete helperEnv.HARNESS_OWNER_TOKEN; delete helperEnv.OPENAI_API_KEY; delete helperEnv.NODE_OPTIONS;
  if (!spawnSync("node", ["--version"], { env: helperEnv, encoding: "utf8" }).error) throw new Error("The installation acceptance PATH unexpectedly contains global Node");
  const run = new Run(path.join(work, "private-commands.log"));
  const summary = { platform: process.platform, architecture: process.arch, codex: cli.version, runtime: runtime.version,
    pluginVersion: JSON.parse(readFileSync(path.join(options.packageRoot, ".codex-plugin/plugin.json"))).version,
    packageSha256: JSON.parse(readFileSync(path.join(options.packageRoot, "macos-package.json"))).packageSha256,
    models: true, gates: [], stages: [], result: "running", startedAt: new Date().toISOString() };
  const save = () => writeFileSync(path.join(work, "summary.json"), JSON.stringify(summary, null, 2) + "\n", { mode: 0o600 });
  const progress = (stage, extra = {}) => { summary.stage = stage; save(); console.log(JSON.stringify({ stage, ...extra })); };
  const helper = (task, args, timeout = 300000) => {
    const result = run.command(path.join(options.packageRoot, "bin/harness"), [task, ...args, "--root", repo], repo, helperEnv, timeout);
    if (result.code !== 0) throw new Error(`Installed ${task} failed: ${lastJson(result.stdout)?.code ?? result.code}`);
    return lastJson(result.stdout);
  };
  const git = args => execFileSync("git", ["-C", repo, "-c", "user.name=Stagekeeper Test", "-c", "user.email=stagekeeper@test.invalid", ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  let server, browser, qaServer, userId, projectId, pipelineId, itemKey, runnerSession, stopped = true;
  try {
    progress("templates");
    summary.templatesExportCommit = seedTemplates(run, options.templates, path.join(work, "private-template-snapshot.json"), environment);
    const codeSha = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repository, encoding: "utf8" }).trim();
    await bootstrapSmokeTemplates({ run, work, codeSha, requestId: login, workflowRun: "macos-native-acceptance" });
    userId = await createFixtureUser(login, token.hash);
    await withPrisma(db => changeUserPlan(db, { userId, plan: "max", note: "Isolated macOS Codex acceptance" }));
    server = await startServer(databaseUrl, path.join(work, "private-server.log"), environment);
    git(["init", "-q", "-b", "harness/macos-a-z"]); git(["config", "core.autocrlf", "false"]);
    git(["remote", "add", "origin", `https://github.com/stagekeeper-e2e/${login}.git`]);
    git(["symbolic-ref", "refs/remotes/origin/HEAD", "refs/remotes/origin/main"]);
    writeFileSync(path.join(repo, "package.json"), JSON.stringify({ name: login, private: true, scripts: { test: "node --test test/*.test.mjs" } }, null, 2) + "\n");
    for (const [name, contents] of Object.entries(FIXTURE_FILES)) { const target = path.join(repo, name); mkdirSync(path.dirname(target), { recursive: true }); writeFileSync(target, contents); }
    git(["add", "."]); git(["commit", "-qm", "Initialize macOS acceptance fixture"]);
    progress("installed-init");
    const project = helper("init", ["--register", "--client", "codex"]);
    assert.equal(project.owner, "stagekeeper-e2e"); assert.equal(project.repo, login); assert.ok(project.slug);
    const config = { version: 1, project, workspaces: [{ id: "app", path: ".", agent: "app-dev", verify: ["npm test"] }],
      qa: { environment: "test", baseUrl: qaOrigin, mcpUrl: `http://127.0.0.1:${browserPort}/mcp`, scenariosPath: "docs/qa/scenarios.md", artifactsDir: artifacts } };
    writeFileSync(path.join(repo, "harness.json"), JSON.stringify(config, null, 2) + "\n");
    mkdirSync(path.join(repo, "docs/qa"), { recursive: true });
    writeFileSync(path.join(repo, "docs/qa/scenarios.md"), "# Native macOS QA scenarios\n\nThe dedicated local test harness serves src/slug.mjs from the implementation report commit and exposes that full SHA as Build. It is a disposable page with no accounts, persistence or external services. Verify the displayed commit first. Fill Text and Max words, click Preview, and inspect Result. Required scenarios: One two three with 2 yields one-two; whitespace-only text with 3 yields empty output; empty text with 0 yields RangeError; a b with 1.5 yields RangeError. Observe console and network errors and capture evidence. Leave no extra tabs or test data. The external harness is test infrastructure, not a product change.\n");
    helper("init", ["--client", "codex", "--dry-run"]); helper("init", ["--client", "codex"]);
    assert.equal(helper("codex", ["complete-init"]).event, "connected");
    git(["add", "."]); git(["commit", "-qm", "Connect macOS Codex fixture"]);
    projectId = await withPrisma(async db => {
      const row = await db.project.findUniqueOrThrow({ where: { slug: project.slug } });
      assert.equal(row.ownerUserId, userId);
      const pipeline = (await loadPipelinesView(db, row.id)).pipelines.find(value => value.isDefault);
      pipelineId = pipeline.id;
      const saved = await savePipelineDefinition(db, { projectId: row.id, userId, pipelineId: pipeline.id, expectedVersion: pipeline.saved?.version ?? 0,
        definition: { steps: ["assign-work", "plan", "verify", "implement", "impl-verify", "qa", "accept", "doc-audit", "scout"], gates: ["before-plan", "before-implement", "before-scout"] } });
      assert.equal(saved.status, "success", saved.reason);
      assert.equal((await setAutomaticScout(db, { projectId: row.id, userId, enabled: false })).ok, true);
      return row.id;
    });
    itemKey = await withPrisma(async db => {
      const source = BACKLOG_ITEM.source + " The independent implementation verifier restores the product file to the approved baseline. Use a module namespace import in tests and assert that slugWords exists inside test cases before calling it, so its absence produces an assertion failure rather than a module-load error.";
      const added = await createBoardService(db).addBacklog(projectId, { ...BACKLOG_ITEM, source, addedBy: "owner", addedByRunId: null });
      assert.equal(added.ok, true, added.reason); return added.item.key;
    });
    const implementationCommit = async () => withPrisma(async db => {
      const row = await db.boardItem.findFirst({ where: { projectId, discardedAt: null, backlogItem: { key: itemKey } }, orderBy: { proposedOn: "desc" }, include: { reports: { orderBy: { at: "asc" } } } });
      const commit = row?.reports.filter(report => report.actor === row.agent && report.agentRunId).at(-1)?.commit;
      return commit ? git(["rev-parse", "--verify", `${commit}^{commit}`]) : null;
    });
    qaServer = createServer(async (request, response) => {
      try {
        const commit = await implementationCommit();
        response.setHeader("Cache-Control", "no-store");
        if (request.url?.startsWith("/module.mjs")) {
          if (!commit || new URL(request.url, qaOrigin).searchParams.get("commit") !== commit) { response.writeHead(409); response.end(); return; }
          response.setHeader("Content-Type", "text/javascript"); response.end(git(["show", `${commit}:src/slug.mjs`])); return;
        }
        response.setHeader("Content-Type", "text/html");
        response.end(`<!doctype html><title>Slug acceptance fixture</title><h1>Slug preview</h1><p>Build: ${commit ?? "pending"}</p><label>Text<input id="text"></label><label>Max words<input id="max" value="2"></label><button id="preview">Preview</button><p>Result: <output id="result"></output></p>${commit ? `<script type="module">import {slugWords} from '/module.mjs?commit=${commit}';document.querySelector('#preview').onclick=()=>{try{document.querySelector('#result').textContent=slugWords(document.querySelector('#text').value,Number(document.querySelector('#max').value));}catch(e){document.querySelector('#result').textContent=e.name;}};</script>` : ""}`);
      } catch { response.writeHead(500); response.end("Fixture could not resolve the implementation build"); }
    });
    await new Promise((resolve, reject) => { qaServer.once("error", reject); qaServer.listen(45442, "127.0.0.1", resolve); });
    const browserLog = openSync(path.join(work, "private-browser.log"), "a");
    browser = spawn(path.join(runtime.directory, "bin/node"), [options.browserCli, "--headless", "--browser", "chrome", "--isolated", "--host", "127.0.0.1", "--allowed-hosts", `127.0.0.1:${browserPort}`, "--allowed-origins", qaOrigin, "--port", String(browserPort), "--output-dir", artifacts], { cwd: repo, env: environment, stdio: ["ignore", browserLog, browserLog] });
    for (let attempt = 0; attempt < 40; attempt++) { try { await fetch(`http://127.0.0.1:${browserPort}/mcp`); break; } catch { await delay(250); } }
    progress("runner-start");
    const started = helper("background", ["--start", "--client", "codex", "--propose", "yes", "--interval", "15", "--run-limit", "60"]);
    assert.equal(started.event, "started"); runnerSession = started.session; stopped = false;
    const deadline = Date.now() + 90 * 60000; let last = null, lastOutput = 0, handoffAt = null, completed = false;
    while (Date.now() < deadline) {
      const observation = await withPrisma(async db => {
        const board = await db.boardItem.findFirst({ where: { projectId, discardedAt: null, backlogItem: { key: itemKey } }, orderBy: { proposedOn: "desc" } });
        if (!board) {
          const finished = await db.agentRun.findFirst({ where: { projectId, agent: "work-assigner", closedAt: { not: null } }, select: { id: true } });
          return { stage: "assignment", failed: finished !== null };
        }
        const next = await nextFor(db, projectId, itemKey);
        if (next.action === "wait" && next.on === "gate") {
          const service = createBoardService(db), current = await service.latestRowFor(projectId, itemKey);
          if (next.gate === "before-scout") {
            await headFor(db, projectId);
            let pending = await db.pipelineWorkRun.findFirst({ where: { projectId, closedAt: null } });
            if (pending?.assignedBoardItemId) return { stage: "before-scout", action: "wait", on: "assignment-report", status: board.status, accepted: board.acceptedAt !== null };
            if (!pending) {
              const prepared = await preparePipelineRun(db, projectId, userId, pipelineId); assert.equal(prepared.ok, true, prepared.reason);
              const opened = await startProjectWork(db, projectId, userId, pipelineId, prepared.item.graphKey); assert.equal(opened.ok, true, opened.reason);
              pending = await db.pipelineWorkRun.findFirstOrThrow({ where: { projectId, closedAt: null } });
            }
            const paused = await stopProjectWork(db, projectId, userId, pending.id); assert.equal(paused.ok, true, paused.reason);
          }
          const approved = await service.gate(projectId, { key: itemKey, gate: next.gate, ...(next.planCommit ? { planCommit: next.planCommit } : {}), ...(next.gateEntry ? { gateEntry: next.gateEntry } : {}) }, { actor: "human", actorRef: userId, channel: "web", expectedUpdatedAt: current.updatedAt });
          assert.equal(approved.ok, true, approved.reason); summary.gates.push(next.gate);
        }
        return { stage: next.node ?? "complete", action: next.action, on: next.on, status: board.status, accepted: board.acceptedAt !== null };
      });
      if (last !== observation.stage || Date.now() - lastOutput > 60000) { progress(observation.stage, observation); last = observation.stage; lastOutput = Date.now(); }
      if (!summary.stages.includes(observation.stage)) summary.stages.push(observation.stage);
      if (observation.failed) throw new Error("Work assignment ended without proposing the fixture item");
      if (observation.action === "done") { assert.equal(observation.accepted, true); completed = true; break; }
      handoffAt = observation.on === "handoff" ? handoffAt ?? Date.now() : null;
      if (handoffAt !== null && Date.now() - handoffAt > 5 * 60000) throw new Error("The report handoff did not finish within five minutes");
      if (observation.status === "on_hold" || ["acceptance", "qa", "impl-verify", "cap"].includes(observation.on)) throw new Error(`Pipeline stopped at ${observation.stage}: ${observation.on ?? observation.status}`);
      const status = helper("background", ["--status"], 30000);
      if (!status.running || status.state === "waiting") throw new Error(`Runner stopped or waits: ${status.waitReason ?? status.lastResult ?? status.state}`);
      await delay(10000);
    }
    if (!completed) throw new Error(`Pipeline observation deadline expired at ${last ?? "assignment"} before reaching done`);
    const settleDeadline = Date.now() + 300000;
    for (;;) {
      const status = helper("background", ["--status"], 30000);
      if (status.running && status.state === "idle") break;
      if (!status.running || status.state === "waiting" || Date.now() > settleDeadline) throw new Error("The completed pipeline did not settle to idle");
      await delay(1000);
    }
    for (const file of ["docs/agents/doc-auditor/audit-log.md", "docs/agents/feature-scout/scouting-log.md"]) {
      const report = readFileSync(path.join(repo, file), "utf8");
      assert.match(report, /harness:role-report:/); assert.equal(git(["show", `HEAD:${file}`]), report.trim());
    }
    summary.ledger = await withPrisma(async db => {
      const board = await db.boardItem.findFirstOrThrow({ where: { projectId, backlogItem: { key: itemKey } }, orderBy: { proposedOn: "desc" }, include: { reports: true, backlogItem: true, run: true } });
      assert.ok(board.acceptedAt); assert.ok(board.backlogItem.removedAt); assert.ok(board.run?.closedAt);
      const agents = await db.agentRun.findMany({ where: { projectId }, select: { agent: true, closedAt: true, steps: { select: { stepId: true, outcome: true, accepted: true } } } });
      const roles = [...new Set(agents.map(value => value.agent))];
      for (const role of ["work-assigner", "app-dev", "plan-verifier", "impl-verifier", "qa-verifier", "doc-auditor", "feature-scout"]) assert.ok(roles.includes(role), `Missing actual role: ${role}`);
      assert.ok(agents.every(value => value.closedAt !== null));
      assert.ok(agents.every(hasSuccessfulRoleRecord), "Every role must record successful steps and its terminal outcome; an owner stop is not role completion");
      return { acceptedAt: board.acceptedAt.toISOString(), roles, runs: agents.length, reports: board.reports.length, closed: agents.every(value => value.closedAt !== null), successfulRoles: true };
    });
    const implementation = await import(pathToFileURL(path.join(repo, "src/slug.mjs")).href);
    assert.ok(caseResults(implementation.slugWords).every(Boolean));
    const beforeIdle = await withPrisma(db => db.agentRun.count({ where: { projectId } }));
    const modelStarts = () => countResidentModelStarts(readFileSync(path.join(repo, ".git/harness/background.log"), "utf8"));
    const beforeIdleModels = modelStarts();
    assert.ok(beforeIdleModels > 0);
    summary.idleStartedAt = new Date().toISOString();
    summary.idleBaseline = { agentRuns: beforeIdle, modelStarts: beforeIdleModels };
    progress("idle-observation", { minutes: options.idleMinutes });
    const idleStart = Date.now(); let previousSample = idleStart;
    while (Date.now() - idleStart < options.idleMinutes * 60000) {
      await delay(Math.min(60000, options.idleMinutes * 60000 - (Date.now() - idleStart)));
      const sampledAt = Date.now();
      summary.maxIdleSampleGapMs = Math.max(summary.maxIdleSampleGapMs ?? 0, sampledAt - previousSample);
      assertIdleObservationGap(previousSample, sampledAt); previousSample = sampledAt;
      const status = helper("background", ["--status"], 30000);
      assert.equal(status.running, true); assert.equal(status.state, "idle");
      assert.equal(await withPrisma(db => db.agentRun.count({ where: { projectId } })), beforeIdle);
      assert.equal(modelStarts(), beforeIdleModels);
      summary.idleSeconds = Math.floor((Date.now() - idleStart) / 1000);
      progress("idle-observation", { seconds: Math.floor((Date.now() - idleStart) / 1000) });
    }
    summary.idleSeconds = Math.floor((Date.now() - idleStart) / 1000);
    summary.idleNewAgentRuns = 0; summary.idleNewModelStarts = 0;
    summary.result = "pass";
  } catch (error) {
    summary.result = "fail"; summary.error = String(error.message).replaceAll(token.plain, "[redacted]").slice(0, 1000);
    throw error;
  } finally {
    if (runnerSession) {
      try {
        const current = helper("background", ["--status"], 30000);
        if (!current.running && !current.held) stopped = true;
        else helper("background", ["--stop"], 30000);
        for (let attempt = 0; attempt < 60; attempt++) {
          const status = helper("background", ["--status"], 30000);
          if (!status.running && !status.held) { stopped = true; break; }
          await delay(1000);
        }
      } catch { stopped = false; }
    }
    if (browser?.exitCode === null) browser.kill();
    if (qaServer?.listening) { qaServer.closeAllConnections(); await new Promise(resolve => qaServer.close(resolve)); }
    if (userId && projectId) {
      try {
        const evidence = await withPrisma(async db => ({
          runs: await db.agentRun.findMany({ where: { projectId }, orderBy: { openedAt: "asc" }, select: { agent: true, stepId: true, openedAt: true, closedAt: true, refused: true,
            steps: { select: { stepId: true, outcome: true, accepted: true, note: true, at: true } } } }),
          items: await db.boardItem.findMany({ where: { projectId }, select: { status: true, acceptedAt: true, reports: { select: { actor: true, path: true, commit: true, at: true } } } }),
        }));
        writeFileSync(path.join(work, "private-final-ledger.json"), JSON.stringify(evidence, null, 2) + "\n", { flag: "wx", mode: 0o600 });
      } catch { summary.ledgerCaptureFailed = true; }
    }
    if (stopped) { await stopServer(server); if (userId) await deleteFixtureUser(userId); }
    summary.runnerStopped = stopped; summary.finishedAt = new Date().toISOString(); save();
    console.log(JSON.stringify({ result: summary.result, stage: summary.stage, error: summary.error, evidence: work, runnerStopped: stopped }));
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch(() => { process.exitCode = 1; });
}

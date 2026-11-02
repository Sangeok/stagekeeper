import type { ChildProcess } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, statSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { newToken } from "../../packages/core/tokens/token.mjs";
import { validateTestDatabase } from "../test-server-integration.mjs";
import { containsSecret, helperCommand } from "./client-init-smoke-steps.mjs";
import { BACKLOG_ITEM, FIXTURE_FILES, INDEPENDENT_CASES, PIPELINE_ROLES, PIPELINE_STEPS, runFindings, sealTranscripts, summarizePipeline, transcriptKey, waitVerdict } from "./pipeline-smoke-steps.mjs";
import { createFixtureUser, createRepository, deleteFixtureUser, installPlugin, newUser, ORIGIN, osLabel, Run, seedTemplates, Smoke, startServer, stopServer, type Plugin } from "./rehearse-client-init-smoke";

const DEFAULT_WAIT_MINUTES = 75;
const DEADLINE_MS = 100 * 60_000;
const SEAL_RESERVE_MS = 5 * 60_000;
const ASSIGN_LIMIT_MS = 20 * 60_000;
const STOP_LIMIT_MS = 15 * 60_000;
const POLL_MS = 15_000;
const STATUS_EVERY_MS = 60_000;
const STOP_POLL_MS = 5_000;
const START_LIMIT_MS = 300_000;
const CASES_LIMIT_MS = 30_000;
const FILE_LIMIT_BYTES = 50 * 1024 * 1024;
const SECRET_NAMES = ["TRANSCRIPT_KEY", "CLAUDE_CODE_OAUTH_TOKEN"];
const COMMIT = /^[0-9a-f]{40}$/;
const WHOLE_NUMBER = /^\d+$/;

export const USAGE = [
  "usage: node --import ./tests/server/register-server-only.mjs --import tsx scripts/rehearsals/rehearse-pipeline-smoke.ts",
  "  --templates <private templates checkout> --plugin-branch <branch> --plugin-commit <40-hex commit>",
  "  --transcripts <sealed file path> [--wait-minutes <5-90, default 75>] [--allow-machine-changes]",
  "environment: TEST_DATABASE_URL (stagekeeper_test_*), TRANSCRIPT_KEY (32 bytes of base64), CI=true unless --allow-machine-changes,",
  "  CLAUDE_CODE_OAUTH_TOKEN when claude is not signed in",
].join("\n");

export type Options = {
  templates: string;
  pluginBranch: string;
  pluginCommit: string;
  transcripts: string;
  waitMinutes: number;
  allowMachineChanges: boolean;
  help: boolean;
};

const VALUED = ["--templates", "--plugin-branch", "--plugin-commit", "--transcripts", "--wait-minutes"];
const FLAGS = ["--allow-machine-changes", "--help"];

export function parseArguments(args: string[]): Options {
  const values = new Map<string, string>();
  const flags = new Set<string>();
  for (let index = 0; index < args.length; index++) {
    const name = args[index];
    if (FLAGS.includes(name)) {
      if (flags.has(name)) throw new Error(`duplicate option ${name}`);
      flags.add(name);
      continue;
    }
    if (!VALUED.includes(name)) throw new Error(`unknown option ${name}`);
    if (values.has(name)) throw new Error(`duplicate option ${name}`);
    const value = args[++index];
    if (!value || value.startsWith("--")) throw new Error(`missing value for ${name}`);
    values.set(name, value);
  }
  const help = flags.has("--help");
  if (help) return { templates: "", pluginBranch: "", pluginCommit: "", transcripts: "", waitMinutes: DEFAULT_WAIT_MINUTES, allowMachineChanges: false, help };
  const templates = values.get("--templates");
  const pluginBranch = values.get("--plugin-branch");
  const pluginCommit = values.get("--plugin-commit");
  const transcripts = values.get("--transcripts");
  const wait = values.get("--wait-minutes") ?? String(DEFAULT_WAIT_MINUTES);
  if (!templates || !path.isAbsolute(templates)) throw new Error("--templates must be an absolute path");
  if (!pluginBranch) throw new Error("--plugin-branch is required");
  if (!pluginCommit || !COMMIT.test(pluginCommit)) throw new Error("--plugin-commit must be a 40-hex commit");
  if (!transcripts || !path.isAbsolute(transcripts)) throw new Error("--transcripts must be an absolute path");
  const waitMinutes = Number(wait);
  if (!WHOLE_NUMBER.test(wait) || waitMinutes < 5 || waitMinutes > 90) throw new Error("--wait-minutes must be a whole number from 5 to 90");
  return { templates, pluginBranch, pluginCommit, transcripts, waitMinutes, allowMachineChanges: flags.has("--allow-machine-changes"), help };
}

type Secrets = { key: Buffer; oauth: string | undefined };
type RunnerStatus = { running?: boolean; held?: boolean; state?: string | null; waitReason?: string | null };
type WaitResult = { verdict: string; step?: string };
type Collected = { files: Record<string, string>; skipped: string[]; streams: string[]; transcripts: string[]; runs: string[] };

const CASES = [
  "const [steps, slug] = process.argv.slice(1);",
  "const { caseResults } = await import(steps);",
  "const { slugWords } = await import(slug);",
  "console.log(JSON.stringify(caseResults(slugWords)));",
].join("\n");

class WaitEnded extends Error {
  constructor(readonly step: string) {
    super(`the wait ended at ${step}`);
  }
}

async function waitFor(run: Run, name: string, wait: () => Promise<WaitResult>): Promise<void> {
  try {
    await run.step(name, async () => {
      const result = await wait();
      if (result.verdict === "fail") throw new WaitEnded(result.step ?? name);
    });
  } catch (error) {
    if (error instanceof WaitEnded && error.step !== name) {
      run.steps[run.steps.length - 1] = { step: error.step, result: "fail" };
      run.failure = error.step;
    }
    throw error;
  }
}

function lastJson(text: string): Record<string, unknown> | null {
  const line = text.split(/\r?\n/).map(entry => entry.trim()).filter(entry => entry.startsWith("{")).at(-1);
  if (!line) return null;
  try {
    return JSON.parse(line) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function statusReader(read: () => RunnerStatus | null) {
  let last: RunnerStatus | null = null;
  let readAt = -Infinity;
  let waitingSince: number | null = null;
  return {
    read(force = false): RunnerStatus | null {
      if (force || Date.now() - readAt >= STATUS_EVERY_MS) {
        last = read();
        readAt = Date.now();
        waitingSince = last?.state === "waiting" ? waitingSince ?? readAt : null;
      }
      return last;
    },
    last: (): RunnerStatus | null => last,
    waitingMs: (): number => (waitingSince === null ? 0 : Date.now() - waitingSince),
  };
}

function bundleName(parts: string[]): string {
  return parts.map(part => part.replace(/[^A-Za-z0-9_.-]/g, "_")).join("/");
}

function filesUnder(root: string, accept: (file: string) => boolean): string[] {
  if (!existsSync(root)) return [];
  const found: string[] = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) found.push(...filesUnder(full, accept));
    else if (entry.isFile() && accept(full)) found.push(full);
  }
  return found.sort();
}

function runLine(text: string): string | null {
  try {
    const line = (JSON.parse(text) as { line?: unknown }).line;
    return typeof line === "string" ? line : null;
  } catch {
    return null;
  }
}

function collect(repo: string | undefined, work: string): Collected {
  const collected: Collected = { files: {}, skipped: [], streams: [], transcripts: [], runs: [] };
  const add = (name: string, file: string): string | null => {
    try {
      const size = statSync(file).size;
      if (size > FILE_LIMIT_BYTES) {
        collected.skipped.push(`${name} ${size}`);
        return null;
      }
      const text = readFileSync(file, "utf8");
      collected.files[name] = text;
      return text;
    } catch {
      collected.skipped.push(`${name} unreadable`);
      return null;
    }
  };
  for (const name of ["commands.log", "server.log"]) if (existsSync(path.join(work, name))) add(name, path.join(work, name));
  if (repo) {
    const harness = path.join(repo, ".git", "harness");
    for (const name of ["background.log", "background.json"]) if (existsSync(path.join(harness, name))) add(name, path.join(harness, name));
    const runs = path.join(harness, "runs");
    for (const file of filesUnder(runs, () => true)) {
      const text = add(bundleName(["runs", ...path.relative(runs, file).split(path.sep)]), file);
      if (text === null) continue;
      if (file.endsWith(".jsonl")) collected.streams.push(text);
      const line = file.endsWith(".meta.json") ? runLine(text) : null;
      if (line !== null) collected.runs.push(line);
    }
  }
  const projects = path.join(homedir(), ".claude", "projects");
  for (const file of filesUnder(projects, entry => entry.endsWith(".jsonl"))) {
    const text = add(bundleName(["projects", ...path.relative(projects, file).split(path.sep)]), file);
    if (text !== null) collected.transcripts.push(text);
  }
  return collected;
}

function sealAll(repo: string | undefined, work: string, record: Record<string, unknown>, key: Buffer, target: string): boolean {
  try {
    const collected = collect(repo, work);
    const findings = runFindings(collected.streams, collected.transcripts);
    record.findings = findings;
    record.runs = collected.runs;
    const files = {
      ...collected.files,
      "findings.json": `${JSON.stringify(findings, null, 2)}\n`,
      ...(collected.skipped.length > 0 ? { "skipped.txt": `${collected.skipped.join("\n")}\n` } : {}),
    };
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, sealTranscripts(files, key));
    return true;
  } catch {
    console.error("transcripts: the sealed bundle was not written");
    return false;
  }
}

async function cleanup(label: string, action: () => unknown): Promise<void> {
  try {
    await action();
  } catch {
    console.error(`cleanup: ${label} failed`);
  }
}

async function runPipelineSmoke(options: Options, databaseUrl: string, env: NodeJS.ProcessEnv, secrets: Secrets): Promise<number> {
  const started = Date.now();
  const deadline = started + DEADLINE_MS;
  const work = realpathSync.native(mkdtempSync(path.join(env.RUNNER_TEMP ?? tmpdir(), "stagekeeper-pipeline-")));
  const run = new Run(path.join(work, "commands.log"));
  const token = newToken("user");
  const login = `stagekeeper-e2e-${randomBytes(4).toString("hex")}`;
  const record: Record<string, unknown> = { os: osLabel(), steps: run.steps };
  const childEnv: NodeJS.ProcessEnv = { ...env, DATABASE_URL: databaseUrl, TEST_DATABASE_URL: databaseUrl };
  const helperEnv: NodeJS.ProcessEnv = { ...env, HARNESS_TOKEN: token.plain, HARNESS_SERVER: ORIGIN };
  delete helperEnv.DATABASE_URL;
  delete helperEnv.TEST_DATABASE_URL;
  const runnerEnv: NodeJS.ProcessEnv = secrets.oauth ? { ...helperEnv, CLAUDE_CODE_OAUTH_TOKEN: secrets.oauth } : helperEnv;
  const secretValues = [secrets.oauth, secrets.key.toString("base64")].filter((value): value is string => typeof value === "string" && value.length > 0);
  const leaks = (text: string): boolean => containsSecret(text, token.plain) || secretValues.some(value => text.includes(value));
  process.env.DATABASE_URL = databaseUrl;
  const { withPrisma } = await import("../lib/prisma");
  const { createBoardService, loadPipelinesView, nextFor, savePipelineDefinition } = await import("../../src/server/pipeline/api");
  let server: ChildProcess | undefined;
  let userId: string | undefined;
  let repo: string | undefined;
  let plugin: Plugin | undefined;
  let runnerStopped = false;
  const background = (args: string[], commandEnv: NodeJS.ProcessEnv, timeout?: number) => {
    const command = helperCommand(process.platform, plugin!.root, "background", [...args, "--root", repo!]);
    return run.command(command.file, command.args, repo!, commandEnv, timeout);
  };
  const statuses = statusReader(() => {
    const outcome = background(["--status"], helperEnv);
    return outcome.code === 0 ? (lastJson(outcome.stdout) as RunnerStatus | null) : null;
  });
  try {
    record.templatesCommit = await run.step("seed-templates", () => seedTemplates(run, options.templates, path.join(work, "template-snapshot.json"), childEnv));
    userId = await run.step("fixture", () => createFixtureUser(login, token.hash));
    server = await run.step("server", () => startServer(databaseUrl, path.join(work, "server.log"), childEnv));
    const fixtureRepo = await run.step("repository", () => {
      const created = createRepository(work, "pipeline");
      for (const [name, text] of Object.entries(FIXTURE_FILES)) {
        const target = path.join(created, ...name.split("/"));
        mkdirSync(path.dirname(target), { recursive: true });
        writeFileSync(target, text);
      }
      run.succeed("git", ["add", "-A"], created, helperEnv, "git add");
      run.succeed("git", ["commit", "-q", "-m", "chore: add slug module"], created, helperEnv, "git commit");
      return created;
    });
    repo = fixtureRepo;
    const fixtureUser = userId;
    const smoke = new Smoke(run, fixtureRepo, helperEnv, fixtureUser);
    const installed = await run.step("plugin-install", () => installPlugin(run, { pluginSource: "github-branch", pluginBranch: options.pluginBranch, pluginCommit: options.pluginCommit }, work, helperEnv));
    plugin = installed;
    record.pluginCommit = installed.commit;
    await newUser(smoke, installed, "pipeline", login, token.plain, childEnv);
    await run.step("pro-roles-commit", () => {
      run.succeed("git", ["add", "-A"], fixtureRepo, helperEnv, "git add");
      run.succeed("git", ["commit", "-q", "-m", "chore: add the Pro roles"], fixtureRepo, helperEnv, "git commit");
    });
    const projectId = await run.step("pipeline-saved", () => withPrisma(async prisma => {
      const project = await prisma.project.findFirstOrThrow({ where: { ownerUserId: fixtureUser }, select: { id: true } });
      const pipeline = (await loadPipelinesView(prisma, project.id)).pipelines.find(entry => entry.isDefault);
      if (!pipeline) throw new Error("the project has no default pipeline");
      const result = await savePipelineDefinition(prisma, {
        projectId: project.id, userId: fixtureUser, pipelineId: pipeline.id,
        definition: { steps: [...PIPELINE_STEPS], gates: [] }, expectedVersion: pipeline.saved?.version ?? 0,
      });
      if (result.status !== "success") throw new Error(`pipeline save: ${result.status === "error" ? result.reason : result.status}`);
      return project.id;
    }));
    const itemKey = await run.step("backlog-added", () => withPrisma(async prisma => {
      const added = await createBoardService(prisma).addBacklog(projectId, { ...BACKLOG_ITEM, addedBy: "owner", addedByRunId: null });
      if (!added.ok) throw new Error(`backlog add: ${added.reason}`);
      return added.item.key;
    }));
    const headBeforeRunner = run.succeed("git", ["rev-parse", "HEAD"], fixtureRepo, helperEnv, "git rev-parse").stdout.trim();
    const startedEvent = await run.step("runner-start", () => {
      const outcome = background(["--start", "--propose", "yes"], runnerEnv, START_LIMIT_MS);
      const event = lastJson(outcome.stdout);
      if (outcome.code !== 0 || event?.event !== "started") throw new Error(`background start exited ${outcome.code}: ${typeof event?.code === "string" ? event.code : "no started event"}`);
      return event;
    });
    record.permission = startedEvent.permission;
    const runnerStartedAt = Date.now();
    const assignDeadline = Math.min(runnerStartedAt + ASSIGN_LIMIT_MS, deadline - SEAL_RESERVE_MS);
    await waitFor(run, "item-assigned", () => withPrisma(async prisma => {
      for (;;) {
        const row = await prisma.boardItem.findFirst({ where: { projectId, discardedAt: null, backlogItem: { key: itemKey } }, orderBy: { proposedOn: "desc" }, select: { status: true, selectionDecision: true } });
        if (row && row.selectionDecision !== null) return { verdict: "done" };
        const result = waitVerdict({ next: null, boardStatus: row?.status ?? null, runner: statuses.read(), waitingMs: statuses.waitingMs(), now: Date.now(), deadline: assignDeadline, timeoutStep: "item-assigned" });
        if (result.verdict !== "wait") return result;
        await delay(POLL_MS);
      }
    }));
    const doneDeadline = Math.min(runnerStartedAt + options.waitMinutes * 60_000, deadline - SEAL_RESERVE_MS);
    await waitFor(run, "item-done", () => withPrisma(async prisma => {
      for (;;) {
        const row = await prisma.boardItem.findFirst({ where: { projectId, discardedAt: null, backlogItem: { key: itemKey } }, orderBy: { proposedOn: "desc" }, select: { status: true } });
        const next = row ? await nextFor(prisma, projectId, itemKey) : null;
        const result = waitVerdict({ next, boardStatus: row?.status ?? null, runner: statuses.read(), waitingMs: statuses.waitingMs(), now: Date.now(), deadline: doneDeadline, timeoutStep: "item-done" });
        if (result.verdict !== "wait") return result;
        await delay(POLL_MS);
      }
    }));
    record.minutesToDone = Math.round((Date.now() - runnerStartedAt) / 60_000);
    await run.step("roles-ran", () => withPrisma(async prisma => {
      const runs = await prisma.agentRun.findMany({ where: { projectId }, select: { agent: true, refused: true } });
      record.stepRefusals = runs.reduce((sum, entry) => sum + entry.refused, 0);
      const ran = new Set(runs.map(entry => entry.agent));
      const missing = PIPELINE_ROLES.filter((role: string) => !ran.has(role));
      if (missing.length > 0) throw new Error(`these roles did not run: ${missing.join(", ")}`);
    }));
    await run.step("runner-stop", async () => {
      const stop = background(["--stop"], helperEnv);
      if (stop.code !== 0) throw new Error(`background stop exited ${stop.code}`);
      const stopDeadline = Math.min(Date.now() + STOP_LIMIT_MS, deadline - SEAL_RESERVE_MS);
      for (;;) {
        const status = statuses.read(true);
        if (status?.running === false) {
          if (status.held) throw new Error("the stopped runner still holds the checkout");
          return;
        }
        if (Date.now() >= stopDeadline) throw new Error("the runner did not stop in time");
        await delay(STOP_POLL_MS);
      }
    });
    runnerStopped = true;
    await run.step("implementation-check", () => {
      if (run.succeed("git", ["status", "--porcelain"], fixtureRepo, helperEnv, "git status").stdout.trim() !== "") throw new Error("the runner left uncommitted changes");
      if (run.succeed("git", ["rev-parse", "HEAD"], fixtureRepo, helperEnv, "git rev-parse").stdout.trim() === headBeforeRunner) throw new Error("the runner made no commit");
      run.succeed(process.execPath, ["--test"], fixtureRepo, helperEnv, "node --test");
      const steps = new URL("./pipeline-smoke-steps.mjs", import.meta.url).href;
      const slug = pathToFileURL(path.join(fixtureRepo, "src", "slug.mjs")).href;
      const output = run.succeed(process.execPath, ["--input-type=module", "-e", CASES, steps, slug], fixtureRepo, helperEnv, "independent cases", CASES_LIMIT_MS).stdout;
      const results: unknown = JSON.parse(output.trim().split(/\r?\n/).at(-1) ?? "null");
      if (!Array.isArray(results) || results.length !== INDEPENDENT_CASES.length || !results.every(value => value === true)) throw new Error("slugWords does not follow the backlog request");
    });
    await run.step("secret-scan", () => {
      const collected = collect(fixtureRepo, work);
      if ([...run.outputs, ...Object.values(collected.files)].some(leaks)) throw new Error("a command output or transcript contains a token or the transcript key");
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`step ${run.failure ?? "unknown"} failed: ${leaks(message) ? "details withheld because they contain a secret" : message.slice(0, 500)}`);
    console.error(`server: ${!server ? "not started" : server.exitCode === null ? "running" : `exited ${server.exitCode}`}`);
    run.failure ??= "unexpected";
  } finally {
    if (plugin && repo && !runnerStopped) {
      await cleanup("runner", async () => {
        if (statuses.read(true)?.running !== true) return;
        background(["--stop"], helperEnv);
        while (Date.now() < deadline - SEAL_RESERVE_MS) {
          await delay(STOP_POLL_MS);
          if (statuses.read(true)?.running === false) return;
        }
      });
    }
    await cleanup("server", () => stopServer(server));
    if (userId) await cleanup("fixture user", () => deleteFixtureUser(userId!));
    const latest = statuses.last();
    record.runnerState = latest?.state ?? undefined;
    record.waitReason = latest?.waitReason ?? undefined;
    record.sealed = sealAll(repo, work, record, secrets.key, options.transcripts);
    if (!record.sealed) run.failure ??= "transcripts-sealed";
  }
  record.failure = run.failure;
  record.seconds = Math.round((Date.now() - started) / 1000);
  console.log(JSON.stringify(summarizePipeline(record)));
  return run.failure ? 1 : 0;
}

export async function main(args: string[], env: Record<string, string | undefined> = process.env): Promise<number> {
  let options: Options;
  try {
    options = parseArguments(args);
  } catch (error) {
    console.error(`${(error as Error).message}\n${USAGE}`);
    return 2;
  }
  if (options.help) {
    console.log(USAGE);
    return 0;
  }
  if (env.CI !== "true" && !options.allowMachineChanges) {
    console.error("refused: this rehearsal registers a user-scope MCP server, saves HARNESS_SERVER and spends real model usage; run it in CI or pass --allow-machine-changes");
    return 2;
  }
  let databaseUrl: string;
  try {
    databaseUrl = validateTestDatabase(env);
  } catch (error) {
    console.error((error as Error).message);
    return 2;
  }
  let key: Buffer;
  try {
    key = transcriptKey(env.TRANSCRIPT_KEY);
  } catch (error) {
    console.error((error as Error).message);
    return 2;
  }
  const oauth = env.CLAUDE_CODE_OAUTH_TOKEN;
  for (const name of SECRET_NAMES) {
    delete env[name];
    delete process.env[name];
  }
  return runPipelineSmoke(options, databaseUrl, env as NodeJS.ProcessEnv, { key, oauth });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then(code => { process.exitCode = code; }, () => { console.error("Pipeline smoke failed before it could report; diagnostic details withheld."); process.exitCode = 1; });
}

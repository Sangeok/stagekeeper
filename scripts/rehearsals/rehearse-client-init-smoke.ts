import { execFileSync, spawn, spawnSync, type ChildProcess } from "node:child_process";
import { randomBytes, randomInt } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, openSync, readFileSync, readdirSync, realpathSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { newToken } from "../../packages/core/tokens/token.mjs";
import { validateTestDatabase } from "../test-server-integration.mjs";
import { containsSecret, helperCommand, summarize } from "./client-init-smoke-steps.mjs";

const REPO = realpathSync(fileURLToPath(new URL("../..", import.meta.url)));
const MARKETPLACE = "stagekeeper-local";
const PLUGIN_REPOSITORY = "https://github.com/Sangeok/stagekeeper.git";
const PORT = 55438;
const ORIGIN = `http://127.0.0.1:${PORT}`;
const FREE_AGENTS = 3;
const PRO_AGENTS = 7;
const PLAN_SKIPS_ON_FREE = 4;
const COMMIT = /^[0-9a-f]{40}$/;

export const USAGE = [
  "usage: node --import tsx scripts/rehearsals/rehearse-client-init-smoke.ts",
  "  --client claude --scenario <new-user|update> --templates <private templates checkout>",
  "  --plugin-source <github-branch|export> --plugin-commit <40-hex commit> [--plugin-branch <branch>]",
  "  [--previous-ref <40-hex commit, update only>] [--snapshot <path outside this repository>] [--allow-machine-changes]",
  "environment: TEST_DATABASE_URL (stagekeeper_test_*), CI=true unless --allow-machine-changes",
].join("\n");

export type Options = {
  client: "claude" | "codex";
  scenario: "new-user" | "update";
  templates: string;
  pluginSource: "github-branch" | "export" | "bundle";
  pluginCommit: string;
  pluginBranch?: string;
  previousRef?: string;
  snapshot?: string;
  allowMachineChanges: boolean;
  help: boolean;
};

const VALUED = ["--client", "--scenario", "--templates", "--plugin-source", "--plugin-commit", "--plugin-branch", "--previous-ref", "--snapshot"];
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
  if (help) return { client: "claude", scenario: "new-user", templates: "", pluginSource: "github-branch", pluginCommit: "", allowMachineChanges: false, help };
  const client = values.get("--client");
  const scenario = values.get("--scenario");
  const pluginSource = values.get("--plugin-source");
  const templates = values.get("--templates");
  const pluginCommit = values.get("--plugin-commit");
  const previousRef = values.get("--previous-ref");
  if (client !== "claude" && client !== "codex") throw new Error("--client must be claude or codex");
  if (scenario !== "new-user" && scenario !== "update") throw new Error("--scenario must be new-user or update");
  if (pluginSource !== "github-branch" && pluginSource !== "export" && pluginSource !== "bundle") throw new Error("--plugin-source must be github-branch, export or bundle");
  if (!templates || !path.isAbsolute(templates)) throw new Error("--templates must be an absolute path");
  if (!pluginCommit || !COMMIT.test(pluginCommit)) throw new Error("--plugin-commit must be a 40-hex commit");
  if (pluginSource === "github-branch" && !values.get("--plugin-branch")) throw new Error("--plugin-source github-branch needs --plugin-branch");
  if (scenario === "update" && (!previousRef || !COMMIT.test(previousRef))) throw new Error("--scenario update needs --previous-ref with a 40-hex commit");
  if (scenario === "new-user" && previousRef) throw new Error("--previous-ref applies only to --scenario update");
  const snapshot = values.get("--snapshot");
  if (snapshot && !path.isAbsolute(snapshot)) throw new Error("--snapshot must be an absolute path");
  if (client !== "claude" || pluginSource === "bundle") throw new Error(`${client} from ${pluginSource} is not implemented yet`);
  return { client, scenario, templates, pluginSource, pluginCommit, pluginBranch: values.get("--plugin-branch"), previousRef, snapshot, allowMachineChanges: flags.has("--allow-machine-changes"), help };
}

type Command = { code: number; stdout: string; stderr: string };
type Step = { step: string; result: "pass" | "fail" | "skip" };
type McpClient = {
  connectionInput(root: string, options: { server: string }): { config: { workspaces: unknown[]; language: string } };
  verifyProject(input: unknown): Promise<unknown>;
  callTool(input: unknown, name: string, args: Record<string, unknown>): Promise<unknown>;
};
type Plugin = { root: string; commit: string; client: McpClient };
type Connection = { slug: string; syncedAt: Date };

class Run {
  readonly steps: Step[] = [];
  readonly outputs: string[] = [];
  failure: string | undefined;

  constructor(readonly log: string) {}

  async step<T>(name: string, action: () => Promise<T> | T): Promise<T> {
    try {
      const value = await action();
      this.steps.push({ step: name, result: "pass" });
      return value;
    } catch (error) {
      this.steps.push({ step: name, result: "fail" });
      this.failure = name;
      throw error;
    }
  }

  command(file: string, args: string[], cwd: string, env: NodeJS.ProcessEnv, timeout = 120_000): Command {
    const result = spawnSync(file, args, { cwd, env, encoding: "utf8", timeout, windowsHide: true, maxBuffer: 16 * 1024 * 1024 });
    const outcome = { code: result.status ?? -1, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
    this.outputs.push(outcome.stdout, outcome.stderr);
    appendFileSync(this.log, `$ ${path.basename(file)} ${args.join(" ")}\nexit ${outcome.code}\n${outcome.stdout}\n${outcome.stderr}\n`);
    return outcome;
  }

  succeed(file: string, args: string[], cwd: string, env: NodeJS.ProcessEnv, label: string, timeout?: number): Command {
    const outcome = this.command(file, args, cwd, env, timeout);
    if (outcome.code !== 0) throw new Error(`${label} exited ${outcome.code}${markerLine(outcome)}`);
    return outcome;
  }
}

class Smoke {
  constructor(
    readonly run: Run,
    readonly repo: string,
    readonly helperEnv: NodeJS.ProcessEnv,
    readonly userId: string,
  ) {}

  helper(plugin: Plugin, args: string[], label: string): Command {
    const command = helperCommand(process.platform, plugin.root, "init", args);
    return this.run.succeed(command.file, command.args, this.repo, this.helperEnv, label);
  }

  claude(args: string[], label: string): Command {
    return this.run.succeed("claude", args, this.repo, this.helperEnv, label);
  }

  async dryRun(plugin: Plugin, name: string, plan: "free" | "pro", skips: number, fresh = false): Promise<void> {
    await this.run.step(name, () => {
      const output = this.helper(plugin, ["--dry-run"], name).stdout;
      if (countLines(output, new RegExp(`^plan: ${plan}$`)) !== 1) throw new Error(`dry-run did not report plan: ${plan}`);
      if (countLines(output, /^skip\(plan\):/) !== skips) throw new Error(`dry-run did not skip ${skips} agents for the ${plan} plan`);
      if (countLines(output, new RegExp(`^server: ${ORIGIN.replace(/[.]/g, "\\.")}$`)) !== 1) throw new Error("dry-run did not report the server");
      if (fresh && existsSync(path.join(this.repo, "CLAUDE.md"))) throw new Error("dry-run wrote CLAUDE.md");
    });
  }

  async generate(plugin: Plugin, name: string, agents: number): Promise<void> {
    await this.run.step(name, () => {
      this.helper(plugin, [], name);
      if (agentFiles(this.repo) !== agents) throw new Error(`generation wrote ${agentFiles(this.repo)} agent files instead of ${agents}`);
      if (!existsSync(path.join(this.repo, "CLAUDE.md"))) throw new Error("generation did not write CLAUDE.md");
    });
  }

  async connected(name: string): Promise<void> {
    await this.run.step(name, () => {
      if (!/Connected/.test(this.claude(["mcp", "get", "harness"], name).stdout)) throw new Error("claude mcp get harness did not report Connected");
    });
  }

  async sync(plugin: Plugin, name: string, slug: string, after?: Date): Promise<Date> {
    return this.run.step(name, async () => {
      const input = plugin.client.connectionInput(this.repo, { server: ORIGIN });
      await plugin.client.verifyProject(input);
      const result = await plugin.client.callTool(input, "project_sync", { workspaces: input.config.workspaces, language: input.config.language }) as { synced?: unknown } | null;
      if (typeof result?.synced !== "number") throw new Error("project_sync did not report a synced count");
      const state = await projectState(slug, this.userId);
      if (!state.runbookVersion) throw new Error("the generator did not record the runbook version");
      if (!state.lastSyncedAt) throw new Error("project_sync did not record lastSyncedAt");
      if (after && state.lastSyncedAt.getTime() <= after.getTime()) throw new Error("project_sync did not advance lastSyncedAt");
      if (state.workspaces !== 1) throw new Error(`the roster has ${state.workspaces} workspaces instead of 1`);
      return state.lastSyncedAt;
    });
  }

  async firstConnection(plugin: Plugin, prefix: string, scenario: string, token: string): Promise<Connection> {
    const project = await this.run.step(`${prefix}register`, () => {
      const line = this.helper(plugin, ["--register"], "register").stdout.split(/\r?\n/).map(text => text.trim()).filter(text => text.startsWith("{")).at(-1);
      const value = line ? JSON.parse(line) as Record<string, unknown> : null;
      if (!value || value.owner !== "stagekeeper-e2e" || value.repo !== `${scenario}-${osLabel()}` || typeof value.slug !== "string" || !value.slug) throw new Error("register did not return the repository with a slug");
      return { owner: value.owner, repo: value.repo, branch: value.branch, name: value.name, slug: value.slug };
    });
    await this.run.step(`${prefix}harness-json`, () => {
      const config = { version: 1, project, workspaces: [{ id: "app", path: ".", agent: "app-dev", verify: ["npm test"] }] };
      writeFileSync(path.join(this.repo, "harness.json"), `${JSON.stringify(config, null, 2)}\n`);
    });
    await this.dryRun(plugin, `${prefix}dry-run`, "free", PLAN_SKIPS_ON_FREE, true);
    await this.generate(plugin, `${prefix}generate`, FREE_AGENTS);
    await this.run.step(`${prefix}persist-server`, () => persistServer(this.run, this.helperEnv));
    await this.run.step(`${prefix}mcp-add`, () => {
      if (this.run.command("claude", ["mcp", "get", "harness"], this.repo, this.helperEnv).code === 0) throw new Error("harness is already registered on this machine");
      this.claude(["mcp", "add", "--transport", "http", "--scope", "user", "harness", `${ORIGIN}/api/mcp`, "-H", "Authorization: Bearer ${HARNESS_TOKEN}"], "claude mcp add");
    });
    await this.connected(`${prefix}mcp-connected`);
    await this.run.step(`${prefix}client-config`, () => {
      const config = readFileSync(path.join(homedir(), ".claude.json"), "utf8");
      if (containsSecret(config, token)) throw new Error("the Claude configuration stores a token value");
      if (!config.includes("${HARNESS_TOKEN}")) throw new Error("the Claude configuration does not reference ${HARNESS_TOKEN}");
    });
    const syncedAt = await this.sync(plugin, `${prefix}project-sync`, project.slug);
    await this.run.step(`${prefix}commit`, () => {
      git(this.repo, ["add", "-A"]);
      git(this.repo, ["commit", "-q", "-m", "chore: connect to Stagekeeper"]);
    });
    return { slug: project.slug, syncedAt };
  }
}

function markerLine(outcome: Command): string {
  const line = `${outcome.stdout}\n${outcome.stderr}`.split(/\r?\n/).map(text => text.trim()).filter(text => /^(?:plan|write|skip\(modified\)|skip\(plan\)|refuse|server|stop|note|Config error|Server URL required|Registration|Templates unavailable|Cannot reach|HARNESS_TOKEN required)\b/.test(text)).at(-1);
  return line ? `: ${line}` : "";
}

function git(cwd: string, args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], windowsHide: true }).trim();
}

function countLines(text: string, pattern: RegExp): number {
  return text.split(/\r?\n/).filter(line => pattern.test(line.trim())).length;
}

function agentFiles(repo: string): number {
  const directory = path.join(repo, ".claude", "agents");
  return existsSync(directory) ? readdirSync(directory).filter(name => name.endsWith(".md")).length : 0;
}

function osLabel(): string {
  return `${process.platform}-${process.arch}`;
}

async function startServer(databaseUrl: string, log: string, env: NodeJS.ProcessEnv): Promise<ChildProcess> {
  const output = openSync(log, "a");
  const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", String(PORT)], {
    cwd: REPO,
    env: { ...env, DATABASE_URL: databaseUrl, AUTH_SECRET: randomBytes(32).toString("hex"), AUTH_URL: ORIGIN, AUTH_TRUST_HOST: "true", HARNESS_PUBLIC_URL: ORIGIN },
    stdio: ["ignore", output, output],
    windowsHide: true,
  });
  for (let attempt = 0; attempt < 240; attempt++) {
    if (server.exitCode !== null) throw new Error("server exited before /login answered");
    try {
      if ((await fetch(`${ORIGIN}/login`, { redirect: "manual" })).status === 200) return server;
    } catch {
      await delay(500);
      continue;
    }
    await delay(500);
  }
  server.kill();
  throw new Error("server did not answer /login within 120 seconds");
}

async function stopServer(server: ChildProcess | undefined): Promise<void> {
  if (!server || server.exitCode !== null) return;
  const stopped = new Promise<void>(resolve => server.once("exit", () => resolve()));
  server.kill();
  await Promise.race([stopped, delay(10_000)]);
}

async function loadClient(root: string): Promise<McpClient> {
  return await import(pathToFileURL(path.join(root, "runtime", "mcp-client.mjs")).href) as McpClient;
}

function exportPlugin(commit: string, directory: string): string {
  mkdirSync(directory);
  const archive = `${directory}.tar`;
  writeFileSync(archive, execFileSync("git", ["archive", "--format=tar", commit, ".claude-plugin", "plugin"], { cwd: REPO, maxBuffer: 256 * 1024 * 1024, windowsHide: true }));
  execFileSync("tar", ["-xf", archive, "-C", directory], { windowsHide: true });
  return directory;
}

async function installPlugin(run: Run, options: Options, work: string, env: NodeJS.ProcessEnv): Promise<Plugin> {
  if (options.pluginSource === "github-branch") {
    run.succeed("claude", ["plugin", "marketplace", "add", `${PLUGIN_REPOSITORY}#${options.pluginBranch}`], REPO, env, "marketplace add");
    run.succeed("claude", ["plugin", "install", `harness@${MARKETPLACE}`], REPO, env, "plugin install");
    const clone = path.join(homedir(), ".claude", "plugins", "marketplaces", MARKETPLACE);
    const commit = git(clone, ["rev-parse", "HEAD"]);
    if (commit !== options.pluginCommit) throw new Error(`installed marketplace commit ${commit} is not the commit under test`);
    const version = (JSON.parse(readFileSync(path.join(clone, "plugin", ".claude-plugin", "plugin.json"), "utf8")) as { version: string }).version;
    const root = path.join(homedir(), ".claude", "plugins", "cache", MARKETPLACE, "harness", version);
    if (!existsSync(path.join(root, "bin", "harness-init.mjs"))) throw new Error("installed plugin cache has no generator");
    return { root, commit, client: await loadClient(root) };
  }
  const exported = exportPlugin(options.pluginCommit, path.join(work, "plugin-export"));
  run.succeed("claude", ["plugin", "marketplace", "add", exported], REPO, env, "marketplace add");
  run.succeed("claude", ["plugin", "install", `harness@${MARKETPLACE}`], REPO, env, "plugin install");
  const root = path.join(exported, "plugin");
  return { root, commit: options.pluginCommit, client: await loadClient(root) };
}

function createRepository(work: string, scenario: string): string {
  const repo = path.join(work, "repo");
  mkdirSync(repo);
  git(repo, ["init", "-q", "-b", "main"]);
  git(repo, ["config", "core.autocrlf", "false"]);
  git(repo, ["config", "user.email", "e2e@stagekeeper.invalid"]);
  git(repo, ["config", "user.name", "stagekeeper-e2e"]);
  git(repo, ["remote", "add", "origin", `https://github.com/stagekeeper-e2e/${scenario}-${osLabel()}.git`]);
  git(repo, ["symbolic-ref", "refs/remotes/origin/HEAD", "refs/remotes/origin/main"]);
  writeFileSync(path.join(repo, "package.json"), `${JSON.stringify({ name: `${scenario}-${osLabel()}`, private: true, scripts: { test: "node --test" } }, null, 2)}\n`);
  git(repo, ["add", "-A"]);
  git(repo, ["commit", "-q", "-m", "chore: initial commit"]);
  return repo;
}

function persistServer(run: Run, env: NodeJS.ProcessEnv): void {
  const clean = { ...env };
  delete clean.HARNESS_SERVER;
  if (process.platform === "win32") {
    run.succeed("setx", ["HARNESS_SERVER", ORIGIN], REPO, clean, "setx HARNESS_SERVER");
    const saved = run.succeed("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", "[Environment]::GetEnvironmentVariable('HARNESS_SERVER','User')"], REPO, clean, "read HARNESS_SERVER").stdout.trim();
    if (saved !== ORIGIN) throw new Error("a new shell does not see HARNESS_SERVER");
    return;
  }
  const profile = path.join(homedir(), ".zprofile");
  const line = `export HARNESS_SERVER="${ORIGIN}"`;
  if (!existsSync(profile) || !readFileSync(profile, "utf8").includes(line)) appendFileSync(profile, `\n${line}\n`);
  const saved = run.succeed("zsh", ["-l", "-c", 'printf %s "$HARNESS_SERVER"'], REPO, clean, "read HARNESS_SERVER").stdout.trim();
  if (saved !== ORIGIN) throw new Error("a new login shell does not see HARNESS_SERVER");
}

async function projectState(slug: string, userId: string): Promise<{ runbookVersion: string | null; lastSyncedAt: Date | null; workspaces: number }> {
  const { withPrisma } = await import("../lib/prisma");
  return withPrisma(async prisma => {
    const project = await prisma.project.findUnique({ where: { slug }, include: { workspaces: true } });
    if (!project || project.ownerUserId !== userId) throw new Error("registered project row is missing");
    return { runbookVersion: project.runbookVersion, lastSyncedAt: project.lastSyncedAt, workspaces: project.workspaces.length };
  });
}

async function newUser(smoke: Smoke, plugin: Plugin, options: Options, login: string, token: string, childEnv: NodeJS.ProcessEnv): Promise<void> {
  const connection = await smoke.firstConnection(plugin, "", options.scenario, token);
  await smoke.run.step("rerun-unchanged", () => {
    smoke.helper(plugin, ["--dry-run"], "rerun dry-run");
    smoke.helper(plugin, [], "rerun generate");
    if (git(smoke.repo, ["status", "--porcelain"]) !== "") throw new Error("a rerun changed committed files");
  });
  const rerunAt = await smoke.sync(plugin, "rerun-sync", connection.slug, connection.syncedAt);
  await smoke.run.step("upgrade-pro", () => {
    const output = smoke.run.succeed(process.execPath, ["--import", "tsx", "scripts/grant-plan.ts", login, "pro", "e2e smoke"], REPO, childEnv, "plan:grant").stdout;
    if (!output.includes(`granted: ${login} -> pro`)) throw new Error("plan:grant did not report the Pro plan");
  });
  await smoke.dryRun(plugin, "pro-dry-run", "pro", 0);
  await smoke.generate(plugin, "pro-generate", PRO_AGENTS);
  await smoke.sync(plugin, "pro-sync", connection.slug, rerunAt);
}

async function update(smoke: Smoke, previous: Plugin, installNew: () => Promise<Plugin>, options: Options, token: string): Promise<Plugin> {
  const connection = await smoke.firstConnection(previous, "previous-", options.scenario, token);
  const plugin = await smoke.run.step("plugin-install", installNew);
  await smoke.connected("mcp-unchanged");
  await smoke.dryRun(plugin, "update-dry-run", "free", PLAN_SKIPS_ON_FREE);
  await smoke.generate(plugin, "update-generate", FREE_AGENTS);
  await smoke.sync(plugin, "update-sync", connection.slug, connection.syncedAt);
  return plugin;
}

async function runSmoke(options: Options, databaseUrl: string, env: NodeJS.ProcessEnv): Promise<number> {
  const started = Date.now();
  const work = realpathSync.native(mkdtempSync(path.join(env.RUNNER_TEMP ?? tmpdir(), "stagekeeper-e2e-")));
  const run = new Run(path.join(work, "commands.log"));
  const token = newToken("user");
  const login = `stagekeeper-e2e-${randomBytes(4).toString("hex")}`;
  const record: Record<string, unknown> = { client: options.client, os: osLabel(), scenario: options.scenario, pluginSource: options.pluginSource, steps: run.steps };
  const childEnv: NodeJS.ProcessEnv = { ...env, DATABASE_URL: databaseUrl, TEST_DATABASE_URL: databaseUrl };
  const helperEnv: NodeJS.ProcessEnv = { ...env, HARNESS_TOKEN: token.plain, HARNESS_SERVER: ORIGIN };
  delete helperEnv.DATABASE_URL;
  delete helperEnv.TEST_DATABASE_URL;
  process.env.DATABASE_URL = databaseUrl;
  process.env.HARNESS_TOKEN = token.plain;
  let server: ChildProcess | undefined;
  let userId: string | undefined;
  try {
    record.templatesCommit = await run.step("seed-templates", () => {
      const snapshot = options.snapshot ?? path.join(work, "template-snapshot.json");
      const output = run.succeed(process.execPath, ["--import", "tsx", "scripts/templates/seed-templates.ts", "--dir", options.templates, "--snapshot", snapshot], REPO, childEnv, "seed:templates", 300_000).stdout;
      const revision = /done: \d+ templates atomically seeded from ([0-9a-f]{40})/.exec(output)?.[1];
      if (!revision) throw new Error("seed:templates did not report a template revision");
      return revision;
    });
    userId = await run.step("fixture", async () => {
      const { withPrisma } = await import("../lib/prisma");
      return withPrisma(async prisma => {
        const user = await prisma.user.create({ data: { login, githubId: -randomInt(1, 2_000_000_000) } });
        await prisma.userToken.create({ data: { userId: user.id, hash: token.hash, label: "e2e smoke" } });
        return user.id;
      });
    });
    server = await run.step("server", () => startServer(databaseUrl, path.join(work, "server.log"), childEnv));
    const repo = await run.step("repository", () => createRepository(work, options.scenario));
    const smoke = new Smoke(run, repo, helperEnv, userId);
    if (options.scenario === "new-user") {
      const plugin = await run.step("plugin-install", () => installPlugin(run, options, work, helperEnv));
      record.pluginCommit = plugin.commit;
      await newUser(smoke, plugin, options, login, token.plain, childEnv);
    } else {
      const previousRef = options.previousRef!;
      const previous = await run.step("previous-plugin", async () => {
        const root = path.join(exportPlugin(previousRef, path.join(work, "previous-plugin")), "plugin");
        return { root, commit: previousRef, client: await loadClient(root) };
      });
      record.previousCommit = previous.commit;
      const plugin = await update(smoke, previous, () => installPlugin(run, options, work, helperEnv), options, token.plain);
      record.pluginCommit = plugin.commit;
    }
    await run.step("secret-scan", () => {
      if (run.outputs.some(output => containsSecret(output, token.plain))) throw new Error("a command printed a token value");
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`step ${run.failure ?? "unknown"} failed: ${containsSecret(message, token.plain) ? "details withheld because they contain a token" : message.slice(0, 500)}`);
    run.failure ??= "unexpected";
  } finally {
    await stopServer(server);
    if (userId) {
      const { withPrisma } = await import("../lib/prisma");
      await withPrisma(prisma => prisma.user.delete({ where: { id: userId } })).catch(() => console.error("cleanup: the fixture user was not deleted"));
    }
    delete process.env.HARNESS_TOKEN;
  }
  record.failure = run.failure;
  record.seconds = Math.round((Date.now() - started) / 1000);
  console.log(JSON.stringify(summarize(record)));
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
    console.error("refused: this rehearsal saves HARNESS_SERVER and registers a user-scope MCP server; run it in CI or pass --allow-machine-changes");
    return 2;
  }
  let databaseUrl: string;
  try {
    databaseUrl = validateTestDatabase(env);
  } catch (error) {
    console.error((error as Error).message);
    return 2;
  }
  return runSmoke(options, databaseUrl, env as NodeJS.ProcessEnv);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then(code => { process.exitCode = code; }, () => { console.error("Client init smoke failed before it could report; diagnostic details withheld."); process.exitCode = 1; });
}

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

export const USAGE = [
  "usage: node --import tsx scripts/rehearsals/rehearse-client-init-smoke.ts",
  "  --client claude --scenario new-user --templates <private templates checkout>",
  "  --plugin-source <github-branch|export> --plugin-commit <40-hex commit> [--plugin-branch <branch>]",
  "  [--snapshot <path outside this repository>] [--allow-machine-changes]",
  "environment: TEST_DATABASE_URL (stagekeeper_test_*), CI=true unless --allow-machine-changes",
].join("\n");

export type Options = {
  client: "claude" | "codex";
  scenario: "new-user" | "update";
  templates: string;
  pluginSource: "github-branch" | "export" | "bundle";
  pluginCommit: string;
  pluginBranch?: string;
  snapshot?: string;
  allowMachineChanges: boolean;
  help: boolean;
};

const VALUED = ["--client", "--scenario", "--templates", "--plugin-source", "--plugin-commit", "--plugin-branch", "--snapshot"];
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
  if (client !== "claude" && client !== "codex") throw new Error("--client must be claude or codex");
  if (scenario !== "new-user" && scenario !== "update") throw new Error("--scenario must be new-user or update");
  if (pluginSource !== "github-branch" && pluginSource !== "export" && pluginSource !== "bundle") throw new Error("--plugin-source must be github-branch, export or bundle");
  if (!templates || !path.isAbsolute(templates)) throw new Error("--templates must be an absolute path");
  if (!pluginCommit || !/^[0-9a-f]{40}$/.test(pluginCommit)) throw new Error("--plugin-commit must be a 40-hex commit");
  if (pluginSource === "github-branch" && !values.get("--plugin-branch")) throw new Error("--plugin-source github-branch needs --plugin-branch");
  const snapshot = values.get("--snapshot");
  if (snapshot && !path.isAbsolute(snapshot)) throw new Error("--snapshot must be an absolute path");
  if (client !== "claude" || scenario !== "new-user" || pluginSource === "bundle") throw new Error(`${client} ${scenario} from ${pluginSource} is not implemented yet`);
  return { client, scenario, templates, pluginSource, pluginCommit, pluginBranch: values.get("--plugin-branch"), snapshot, allowMachineChanges: flags.has("--allow-machine-changes"), help };
}

type Command = { code: number; stdout: string; stderr: string };
type Step = { step: string; result: "pass" | "fail" | "skip" };
type McpClient = {
  connectionInput(root: string, options: { server: string }): { config: { workspaces: unknown[]; language: string } };
  verifyProject(input: unknown): Promise<unknown>;
  callTool(input: unknown, name: string, args: Record<string, unknown>): Promise<unknown>;
};

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

function installPlugin(run: Run, options: Options, work: string, env: NodeJS.ProcessEnv): { root: string; commit: string } {
  if (options.pluginSource === "github-branch") {
    run.succeed("claude", ["plugin", "marketplace", "add", `${PLUGIN_REPOSITORY}#${options.pluginBranch}`], REPO, env, "marketplace add");
    run.succeed("claude", ["plugin", "install", `harness@${MARKETPLACE}`], REPO, env, "plugin install");
    const clone = path.join(homedir(), ".claude", "plugins", "marketplaces", MARKETPLACE);
    const commit = git(clone, ["rev-parse", "HEAD"]);
    if (commit !== options.pluginCommit) throw new Error(`installed marketplace commit ${commit} is not the commit under test`);
    const version = (JSON.parse(readFileSync(path.join(clone, "plugin", ".claude-plugin", "plugin.json"), "utf8")) as { version: string }).version;
    const root = path.join(homedir(), ".claude", "plugins", "cache", MARKETPLACE, "harness", version);
    if (!existsSync(path.join(root, "bin", "harness-init.mjs"))) throw new Error("installed plugin cache has no generator");
    return { root, commit };
  }
  const exported = path.join(work, "plugin-export");
  mkdirSync(exported);
  const archive = path.join(work, "plugin-export.tar");
  writeFileSync(archive, execFileSync("git", ["archive", "--format=tar", options.pluginCommit, ".claude-plugin", "plugin"], { cwd: REPO, maxBuffer: 256 * 1024 * 1024, windowsHide: true }));
  execFileSync("tar", ["-xf", archive, "-C", exported], { windowsHide: true });
  run.succeed("claude", ["plugin", "marketplace", "add", exported], REPO, env, "marketplace add");
  run.succeed("claude", ["plugin", "install", `harness@${MARKETPLACE}`], REPO, env, "plugin install");
  return { root: path.join(exported, "plugin"), commit: options.pluginCommit };
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

async function sync(client: McpClient, repo: string): Promise<void> {
  const input = client.connectionInput(repo, { server: ORIGIN });
  await client.verifyProject(input);
  const result = await client.callTool(input, "project_sync", { workspaces: input.config.workspaces, language: input.config.language }) as { synced?: unknown } | null;
  if (typeof result?.synced !== "number") throw new Error("project_sync did not report a synced count");
}

async function projectState(slug: string, userId: string): Promise<{ runbookVersion: string | null; lastSyncedAt: Date | null; workspaces: number }> {
  const { withPrisma } = await import("../lib/prisma");
  return withPrisma(async prisma => {
    const project = await prisma.project.findUnique({ where: { slug }, include: { workspaces: true } });
    if (!project || project.ownerUserId !== userId) throw new Error("registered project row is missing");
    return { runbookVersion: project.runbookVersion, lastSyncedAt: project.lastSyncedAt, workspaces: project.workspaces.length };
  });
}

async function runNewUser(options: Options, databaseUrl: string, env: NodeJS.ProcessEnv): Promise<number> {
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
    server = await run.step("server", () => startServer(databaseUrl, path.join(work, "server.log"), env));
    const plugin = await run.step("plugin-install", () => installPlugin(run, options, work, env));
    record.pluginCommit = plugin.commit;
    const client = await import(pathToFileURL(path.join(plugin.root, "runtime", "mcp-client.mjs")).href) as McpClient;
    const repo = await run.step("repository", () => createRepository(work, options.scenario));
    const helper = (args: string[], label: string) => {
      const command = helperCommand(process.platform, plugin.root, "init", args);
      return run.succeed(command.file, command.args, repo, helperEnv, label);
    };
    const project = await run.step("register", () => {
      const line = helper(["--register"], "register").stdout.split(/\r?\n/).map(text => text.trim()).filter(text => text.startsWith("{")).at(-1);
      const value = line ? JSON.parse(line) as Record<string, unknown> : null;
      if (!value || value.owner !== "stagekeeper-e2e" || value.repo !== `${options.scenario}-${osLabel()}` || typeof value.slug !== "string" || !value.slug) throw new Error("register did not return the repository with a slug");
      return { owner: value.owner, repo: value.repo, branch: value.branch, name: value.name, slug: value.slug };
    });
    await run.step("harness-json", () => {
      const config = { version: 1, project, workspaces: [{ id: "app", path: ".", agent: "app-dev", verify: ["npm test"] }] };
      writeFileSync(path.join(repo, "harness.json"), `${JSON.stringify(config, null, 2)}\n`);
    });
    await run.step("dry-run", () => {
      const output = helper(["--dry-run"], "dry-run").stdout;
      if (countLines(output, /^plan: free$/) !== 1) throw new Error("dry-run did not report plan: free");
      if (countLines(output, /^skip\(plan\):/) !== PLAN_SKIPS_ON_FREE) throw new Error(`dry-run did not skip ${PLAN_SKIPS_ON_FREE} agents for the Free plan`);
      if (countLines(output, new RegExp(`^server: ${ORIGIN.replace(/[.]/g, "\\.")}$`)) !== 1) throw new Error("dry-run did not report the server");
      if (existsSync(path.join(repo, "CLAUDE.md"))) throw new Error("dry-run wrote CLAUDE.md");
    });
    await run.step("generate", () => {
      helper([], "generate");
      if (agentFiles(repo) !== FREE_AGENTS) throw new Error(`generation wrote ${agentFiles(repo)} agent files instead of ${FREE_AGENTS}`);
      if (!existsSync(path.join(repo, "CLAUDE.md"))) throw new Error("generation did not write CLAUDE.md");
    });
    await run.step("persist-server", () => persistServer(run, env));
    await run.step("mcp-add", () => {
      if (run.command("claude", ["mcp", "get", "harness"], repo, helperEnv).code === 0) throw new Error("harness is already registered on this machine");
      run.succeed("claude", ["mcp", "add", "--transport", "http", "--scope", "user", "harness", `${ORIGIN}/api/mcp`, "-H", "Authorization: Bearer ${HARNESS_TOKEN}"], repo, helperEnv, "claude mcp add");
    });
    await run.step("mcp-connected", () => {
      const output = run.succeed("claude", ["mcp", "get", "harness"], repo, helperEnv, "claude mcp get").stdout;
      if (!/Connected/.test(output)) throw new Error("claude mcp get harness did not report Connected");
    });
    await run.step("client-config", () => {
      const config = readFileSync(path.join(homedir(), ".claude.json"), "utf8");
      if (containsSecret(config, token.plain)) throw new Error("the Claude configuration stores a token value");
      if (!config.includes("${HARNESS_TOKEN}")) throw new Error("the Claude configuration does not reference ${HARNESS_TOKEN}");
    });
    process.env.HARNESS_TOKEN = token.plain;
    await run.step("project-sync", () => sync(client, repo));
    const first = await run.step("project-row", async () => {
      const state = await projectState(project.slug, userId!);
      if (!state.runbookVersion) throw new Error("the generator did not record the runbook version");
      if (!state.lastSyncedAt) throw new Error("project_sync did not record lastSyncedAt");
      if (state.workspaces !== 1) throw new Error(`the roster has ${state.workspaces} workspaces instead of 1`);
      return state.lastSyncedAt;
    });
    await run.step("commit", () => {
      git(repo, ["add", "-A"]);
      git(repo, ["commit", "-q", "-m", "chore: connect to Stagekeeper"]);
    });
    await run.step("rerun-unchanged", async () => {
      helper(["--dry-run"], "rerun dry-run");
      helper([], "rerun generate");
      if (git(repo, ["status", "--porcelain"]) !== "") throw new Error("a rerun changed committed files");
      await sync(client, repo);
      const state = await projectState(project.slug, userId!);
      if (!state.lastSyncedAt || state.lastSyncedAt.getTime() <= first.getTime()) throw new Error("the rerun did not advance lastSyncedAt");
    });
    await run.step("upgrade-pro", () => {
      const output = run.succeed(process.execPath, ["--import", "tsx", "scripts/grant-plan.ts", login, "pro", "e2e smoke"], REPO, childEnv, "plan:grant").stdout;
      if (!output.includes(`granted: ${login} -> pro`)) throw new Error("plan:grant did not report the Pro plan");
    });
    await run.step("rerun-pro", async () => {
      const output = helper(["--dry-run"], "pro dry-run").stdout;
      if (countLines(output, /^plan: pro$/) !== 1) throw new Error("dry-run did not report plan: pro");
      if (countLines(output, /^skip\(plan\):/) !== 0) throw new Error("dry-run still skips agents on the Pro plan");
      helper([], "pro generate");
      if (agentFiles(repo) !== PRO_AGENTS) throw new Error(`generation wrote ${agentFiles(repo)} agent files instead of ${PRO_AGENTS}`);
      await sync(client, repo);
    });
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
  return runNewUser(options, databaseUrl, env as NodeJS.ProcessEnv);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then(code => { process.exitCode = code; }, () => { console.error("Client init smoke failed before it could report; diagnostic details withheld."); process.exitCode = 1; });
}

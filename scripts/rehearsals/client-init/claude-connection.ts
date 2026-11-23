import { execFileSync } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { readInstalledTemplate } from "../../../plugin/runtime/template-installation.mjs";
import { assertGeneratedAgents, containsSecret, helperCommand, usesTemplateReleases } from "./client-init-smoke-steps.mjs";
import type { Command, Run } from "../support/command-run";
import { git, osLabel } from "../support/repository-fixture";
import { repositoryRoot as REPO } from "../support/repository-root.mjs";
import type { Options } from "./options";

const MARKETPLACE = "stagekeeper-local";

const PLUGIN_REPOSITORY = "https://github.com/Sangeok/stagekeeper.git";

export type Plugin = { root: string; commit: string };

const SYNC = [
  "const [root, repo, server] = process.argv.slice(1);",
  "const client = await import(new URL(\"runtime/mcp-client.mjs\", require(\"node:url\").pathToFileURL(root + \"/\")).href);",
  "try {",
  "  const input = client.connectionInput(repo, { server });",
  "  await client.verifyProject(input);",
  "  const result = await client.callTool(input, \"project_sync\", { workspaces: input.config.workspaces, language: input.config.language });",
  "  console.log(JSON.stringify({ synced: result?.synced }));",
  "} catch (error) {",
  "  console.error(`sync: ${error.message}${error.cause?.code ? ` (${error.cause.code})` : \"\"}`);",
  "  process.exitCode = 1;",
  "}",
].join("\n");

type Connection = { slug: string; syncedAt: Date };

export class Smoke {
  constructor(
    readonly run: Run,
    readonly repo: string,
    readonly helperEnv: NodeJS.ProcessEnv,
    readonly userId: string,
    readonly databaseUrl: string,
    readonly origin: string,
  ) {}

  helper(plugin: Plugin, args: string[], label: string): Command {
    const command = helperCommand(process.platform, plugin.root, "init", args);
    return this.run.succeed(command.file, command.args, this.repo, this.helperEnv, label);
  }

  claude(args: string[], label: string): Command {
    return this.run.succeed("claude", args, this.repo, this.helperEnv, label);
  }

  async dryRun(plugin: Plugin, name: string, plan: "free" | "pro", fresh = false): Promise<void> {
    await this.run.step(name, () => {
      const output = this.helper(plugin, ["--dry-run"], name).stdout;
      if (countLines(output, new RegExp(`^plan: ${plan}$`)) !== 1) throw new Error(`dry-run did not report plan: ${plan}`);
      if (countLines(output, new RegExp(`^server: ${this.origin.replace(/[.]/g, "\\.")}$`)) !== 1) throw new Error("dry-run did not report the server");
      if (fresh && existsSync(path.join(this.repo, "CLAUDE.md"))) throw new Error("dry-run wrote CLAUDE.md");
    });
  }

  async generate(plugin: Plugin, name: string, plan: "free" | "pro"): Promise<void> {
    await this.run.step(name, async () => {
      const result = this.helper(plugin, [], name);
      if (usesTemplateReleases(pluginVersion(plugin))) {
        if (!/^ready:/m.test(result.stdout)) throw new Error("Versioned init did not commit a ready installation");
        readInstalledTemplate(this.repo, "claude");
      }
      await assertGeneratedAgents(plugin.root, this.repo, plan, ["app-dev"]);
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
      const outcome = this.run.command(process.execPath, ["--input-type=commonjs", "-e", `(async () => {\n${SYNC}\n})()`, plugin.root, this.repo, this.origin], this.repo, this.helperEnv);
      if (outcome.code !== 0) throw new Error(outcome.stderr.split(/\r?\n/).find(line => line.startsWith("sync: ")) ?? `project_sync exited ${outcome.code}`);
      const line = outcome.stdout.split(/\r?\n/).map(text => text.trim()).filter(text => text.startsWith("{")).at(-1);
      if (typeof (line ? JSON.parse(line) as { synced?: unknown } : null)?.synced !== "number") throw new Error("project_sync did not report a synced count");
      const state = await projectState(slug, this.userId, this.databaseUrl);
      const installation = JSON.parse(readFileSync(path.join(this.repo, "harness.lock.json"), "utf8"));
      if (installation.version === 2) readInstalledTemplate(this.repo, "claude");
      else if (!state.runbookVersion) throw new Error("the legacy generator did not record the runbook version");
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
    await this.dryRun(plugin, `${prefix}dry-run`, "free", true);
    await this.generate(plugin, `${prefix}generate`, "free");
    await this.run.step(`${prefix}persist-server`, () => persistServer(this.run, this.helperEnv, this.origin));
    await this.run.step(`${prefix}mcp-add`, () => {
      if (this.run.command("claude", ["mcp", "get", "harness"], this.repo, this.helperEnv).code === 0) throw new Error("harness is already registered on this machine");
      this.claude(["mcp", "add", "--transport", "http", "--scope", "user", "harness", `${this.origin}/api/mcp`, "-H", "Authorization: Bearer ${HARNESS_TOKEN}"], "claude mcp add");
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

function countLines(text: string, pattern: RegExp): number {
  return text.split(/\r?\n/).filter(line => pattern.test(line.trim())).length;
}

export function exportPlugin(commit: string, directory: string): string {
  mkdirSync(directory);
  const archive = `${directory}.tar`;
  writeFileSync(archive, execFileSync("git", ["archive", "--format=tar", commit, ".claude-plugin", "plugin"], { cwd: REPO, maxBuffer: 256 * 1024 * 1024, windowsHide: true }));
  execFileSync("tar", ["-xf", archive, "-C", directory], { windowsHide: true });
  return directory;
}

export const marketplaceSource = (commit: string) => `${PLUGIN_REPOSITORY}#${commit}`;

export async function installPlugin(run: Run, options: Pick<Options, "pluginSource" | "pluginBranch" | "pluginCommit">, work: string, env: NodeJS.ProcessEnv): Promise<Plugin> {
  if (options.pluginSource === "github-branch") {
    run.succeed("claude", ["plugin", "marketplace", "add", marketplaceSource(options.pluginCommit)], REPO, env, "marketplace add");
    run.succeed("claude", ["plugin", "install", `harness@${MARKETPLACE}`], REPO, env, "plugin install");
    const clone = path.join(homedir(), ".claude", "plugins", "marketplaces", MARKETPLACE);
    const commit = git(clone, ["rev-parse", "HEAD"]);
    if (commit !== options.pluginCommit) throw new Error(`installed marketplace commit ${commit} is not the commit under test`);
    const version = (JSON.parse(readFileSync(path.join(clone, "plugin", ".claude-plugin", "plugin.json"), "utf8")) as { version: string }).version;
    const root = path.join(homedir(), ".claude", "plugins", "cache", MARKETPLACE, "harness", version);
    if (!existsSync(path.join(root, "bin", "harness-init.mjs"))) throw new Error("installed plugin cache has no generator");
    return { root, commit };
  }
  const exported = exportPlugin(options.pluginCommit, path.join(work, "plugin-export"));
  run.succeed("claude", ["plugin", "marketplace", "add", exported], REPO, env, "marketplace add");
  run.succeed("claude", ["plugin", "install", `harness@${MARKETPLACE}`], REPO, env, "plugin install");
  const root = path.join(exported, "plugin");
  return { root, commit: options.pluginCommit };
}

function persistServer(run: Run, env: NodeJS.ProcessEnv, origin: string): void {
  const clean = { ...env };
  delete clean.HARNESS_SERVER;
  if (process.platform === "win32") {
    run.succeed("setx", ["HARNESS_SERVER", origin], REPO, clean, "setx HARNESS_SERVER");
    const saved = run.succeed("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", "[Environment]::GetEnvironmentVariable('HARNESS_SERVER','User')"], REPO, clean, "read HARNESS_SERVER").stdout.trim();
    if (saved !== origin) throw new Error("a new shell does not see HARNESS_SERVER");
    return;
  }
  const profile = path.join(homedir(), ".zprofile");
  const line = `export HARNESS_SERVER="${origin}"`;
  if (!existsSync(profile) || !readFileSync(profile, "utf8").includes(line)) appendFileSync(profile, `\n${line}\n`);
  const saved = run.succeed("zsh", ["-l", "-c", 'printf %s "$HARNESS_SERVER"'], REPO, clean, "read HARNESS_SERVER").stdout.trim();
  if (saved !== origin) throw new Error("a new login shell does not see HARNESS_SERVER");
}

async function projectState(slug: string, userId: string, databaseUrl: string): Promise<{ runbookVersion: string | null; lastSyncedAt: Date | null; workspaces: number }> {
  const { withPrisma } = await import("../../lib/prisma");
  return withPrisma(async prisma => {
    const project = await prisma.project.findUnique({ where: { slug }, include: { workspaces: true } });
    if (!project || project.ownerUserId !== userId) throw new Error("registered project row is missing");
    return { runbookVersion: project.runbookVersion, lastSyncedAt: project.lastSyncedAt, workspaces: project.workspaces.length };
  }, databaseUrl);
}

export async function newUser(smoke: Smoke, plugin: Plugin, scenario: string, login: string, token: string, childEnv: NodeJS.ProcessEnv): Promise<void> {
  const connection = await smoke.firstConnection(plugin, "", scenario, token);
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
  await smoke.dryRun(plugin, "pro-dry-run", "pro");
  await smoke.generate(plugin, "pro-generate", "pro");
  await smoke.sync(plugin, "pro-sync", connection.slug, rerunAt);
}

function pluginVersion(plugin: Plugin): string {
  return JSON.parse(readFileSync(path.join(plugin.root, ".claude-plugin/plugin.json"), "utf8")).version;
}

export async function update(smoke: Smoke, previous: Plugin, installNew: () => Promise<Plugin>, options: Options, token: string, cutover: () => Promise<void>): Promise<Plugin> {
  const previousUsesReleases = usesTemplateReleases(pluginVersion(previous));
  if (previousUsesReleases) await cutover();
  const connection = await smoke.firstConnection(previous, "previous-", options.scenario, token);
  if (!previousUsesReleases) await cutover();
  const plugin = await smoke.run.step("plugin-install", installNew);
  await smoke.connected("mcp-unchanged");
  await smoke.dryRun(plugin, "update-dry-run", "free");
  await smoke.generate(plugin, "update-generate", "free");
  await smoke.sync(plugin, "update-sync", connection.slug, connection.syncedAt);
  return plugin;
}

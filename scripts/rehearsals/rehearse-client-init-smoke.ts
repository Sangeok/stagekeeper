import { randomBytes } from "node:crypto";
import { mkdtempSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { newToken } from "../../src/server/tokens/api";
import { validateTestDatabase } from "../lib/test-database.mjs";
import { containsSecret, summarize } from "./client-init-smoke-steps.mjs";
import { measureEnvironment, pluginVersionAt } from "./gate-environment.mjs";
import { startSmokeServer } from "./smoke-server.mjs";
import { parseArguments, USAGE, type Options } from "./client-init/options";
import { Smoke, exportPlugin, installPlugin, newUser, update } from "./client-init/claude-connection";
import { Run } from "./support/command-run";
import { createFixtureUser, deleteFixtureUser } from "./support/smoke-database";
import { bootstrapSmokeTemplates, seedTemplates } from "./support/template-fixture";
import { createRepository, git, osLabel } from "./support/repository-fixture";
import { repositoryRoot as REPO } from "./support/repository-root.mjs";

export { parseArguments, USAGE, Run, Smoke, osLabel, installPlugin, createRepository, newUser,
  seedTemplates, bootstrapSmokeTemplates, createFixtureUser, deleteFixtureUser };
export type { Options } from "./client-init/options";
export type { Plugin } from "./client-init/claude-connection";

async function runSmoke(options: Options, databaseUrl: string, env: NodeJS.ProcessEnv): Promise<number> {
  const started = Date.now();
  const work = realpathSync.native(mkdtempSync(path.join(env.RUNNER_TEMP ?? tmpdir(), "stagekeeper-e2e-")));
  const startup = new AbortController();
  const run = new Run(path.join(work, "commands.log"), startup.signal);
  const token = newToken("user");
  const login = `stagekeeper-e2e-${randomBytes(4).toString("hex")}`;
  const record: Record<string, unknown> = { client: options.client, os: osLabel(), scenario: options.scenario, pluginSource: options.pluginSource, steps: run.steps };
  const childEnv: NodeJS.ProcessEnv = { ...env, DATABASE_URL: databaseUrl, TEST_DATABASE_URL: databaseUrl };
  const helperEnv: NodeJS.ProcessEnv = { ...env, HARNESS_TOKEN: token.plain };
  delete helperEnv.HARNESS_TEMPLATES_DIR;
  delete helperEnv.HARNESS_PLAN;
  delete helperEnv.DATABASE_URL;
  delete helperEnv.TEST_DATABASE_URL;
  Object.assign(record, measureEnvironment(process.platform, (file: string, args: string[]) => run.command(file, args, REPO, helperEnv).stdout));
  let server: Awaited<ReturnType<typeof startSmokeServer>> | undefined;
  let serverCleanupFailed = false;
  const interrupt = () => startup.abort(new Error("Smoke interrupted"));
  process.on("SIGINT", interrupt); process.on("SIGTERM", interrupt);
  let userId: string | undefined;
  try {
    if (options.templateCommit && git(options.templates, ["rev-parse", "HEAD"]) !== options.templateCommit) throw new Error("Private template checkout differs from the pinned smoke source");
    record.templatesCommit = await run.step("seed-templates", () => seedTemplates(run, options.templates, options.snapshot ?? path.join(work, "template-snapshot.json"), childEnv));
    const cutover = () => bootstrapSmokeTemplates({ databaseUrl, run, work, codeSha: options.pluginCommit, requestId: `smoke-${login}`, workflowRun: env.GITHUB_RUN_ID ?? "local-approved-smoke" });
    if (options.scenario === "new-user") await cutover();
    userId = await run.step("fixture", () => createFixtureUser(login, token.hash, databaseUrl));
    server = await run.step("server-start", () => startSmokeServer({ databaseUrl, log: path.join(work, "server.log"), env: childEnv, signal: startup.signal }));
    helperEnv.HARNESS_SERVER = server.origin;
    const repo = await run.step("repository", () => createRepository(work, options.scenario));
    const smoke = new Smoke(run, repo, helperEnv, userId, databaseUrl, server.origin);
    if (options.scenario === "new-user") {
      const plugin = await run.step("plugin-install", () => installPlugin(run, options, work, helperEnv));
      record.pluginCommit = plugin.commit;
      record.pluginVersion = pluginVersionAt(plugin.root);
      await newUser(smoke, plugin, options.scenario, login, token.plain, childEnv);
    } else {
      const previousRef = options.previousRef!;
      const previous = await run.step("previous-plugin", async () => {
        const root = path.join(exportPlugin(previousRef, path.join(work, "previous-plugin")), "plugin");
        return { root, commit: previousRef };
      });
      record.previousCommit = previous.commit;
      const plugin = await update(smoke, previous, () => installPlugin(run, options, work, helperEnv), options, token.plain, cutover);
      record.pluginCommit = plugin.commit;
      record.pluginVersion = pluginVersionAt(plugin.root);
    }
    await run.step("secret-scan", () => {
      if (run.outputs.some(output => containsSecret(output, token.plain))) throw new Error("a command printed a token value");
    });
  } catch (error) {
    serverCleanupFailed = error instanceof Error && "cleanupFailed" in error && error.cleanupFailed === true;
    const message = error instanceof Error ? error.message : String(error);
    console.error(`step ${run.failure ?? "unknown"} failed: ${containsSecret(message, token.plain) ? "details withheld because they contain a token" : message.slice(0, 500)}`);
    console.error(`server: ${!server ? "not started" : server.child.exitCode === null ? "running" : `exited ${server.child.exitCode}`}`);
    run.failure ??= "unexpected";
  } finally {
    try { await server?.stop(); }
    catch { serverCleanupFailed = true; }
    if (serverCleanupFailed) {
      run.steps.push({ step: "server-cleanup", result: "fail" });
      run.failure ??= "server-cleanup";
      console.error("server-cleanup failed; fixture preserved");
    }
    process.off("SIGINT", interrupt); process.off("SIGTERM", interrupt);
    if (userId && !serverCleanupFailed) await deleteFixtureUser(userId, databaseUrl);
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

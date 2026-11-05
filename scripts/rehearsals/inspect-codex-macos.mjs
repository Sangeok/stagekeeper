import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import path from "node:path";
import { validateTestDatabase } from "../test-server-integration.mjs";

const args = process.argv.slice(2), work = args[0], cleanup = args[1] === "--cleanup";
if (!work || !path.isAbsolute(work) || args.length > 2 || args.length === 2 && !cleanup) throw new Error("Use an absolute acceptance directory and optional --cleanup");
const directory = realpathSync(work), summary = JSON.parse(readFileSync(path.join(directory, "summary.json"), "utf8"));
if (!/^stagekeeper-macos-acceptance-/.test(path.basename(directory)) || summary.platform !== "darwin" || summary.models !== true) throw new Error("A recorded macOS acceptance fixture is required");
const databaseUrl = validateTestDatabase(process.env);
if (!["127.0.0.1", "localhost"].includes(new URL(databaseUrl).hostname)) throw new Error("Only a loopback test database may be inspected");
process.env.DATABASE_URL = databaseUrl;
const { withPrisma } = await import("../lib/prisma.ts");
const repo = path.join(directory, "repo"), config = JSON.parse(readFileSync(path.join(repo, "harness.json"), "utf8"));
if (config.project.owner !== "stagekeeper-e2e" || !/^macos-[a-f0-9]{8}$/.test(config.project.repo)) throw new Error("Synthetic acceptance repository required");
const result = await withPrisma(async db => {
  const project = await db.project.findUnique({ where: { slug: config.project.slug }, include: { ownerUser: true } });
  if (!project) return { exists: false };
  if (project.repo !== config.project.repo || project.repoOwner !== "stagekeeper-e2e" || project.ownerUser.login !== config.project.repo || project.ownerUser.githubId >= 0) throw new Error("Fixture owner identity differs");
  const runs = await db.agentRun.findMany({ where: { projectId: project.id }, orderBy: { openedAt: "asc" },
    select: { agent: true, stepId: true, refused: true, openedAt: true, closedAt: true, steps: { select: { stepId: true, outcome: true, note: true, accepted: true, at: true } } } });
  const items = await db.boardItem.findMany({ where: { projectId: project.id }, select: { status: true, acceptedAt: true, reports: { select: { actor: true, path: true, commit: true, at: true } } } });
  writeFileSync(path.join(directory, `private-ledger-${Date.now()}.json`), JSON.stringify({ runs, items }, null, 2) + "\n", { flag: "wx", mode: 0o600 });
  if (cleanup) {
    if (!["pass", "fail"].includes(summary.result)) throw new Error("Do not clean an active rehearsal");
    const plugin = path.join(process.env.HOME, ".codex/plugins/cache/stagekeeper-macos-dev/harness", summary.pluginVersion);
    if (!existsSync(path.join(plugin, "macos-package.json"))) throw new Error("The recorded installed package is required for cleanup status");
    const output = execFileSync(path.join(plugin, "bin/harness"), ["background", "--status", "--root", repo], { encoding: "utf8", timeout: 30000 });
    const status = JSON.parse(output.trim().split(/\r?\n/).at(-1));
    if (status.running || status.held || status.newer || status.session || status.otherSession) throw new Error("Retain fixture data until its runtime ownership is settled");
    if (await db.project.count({ where: { ownerUserId: project.ownerUserId } }) !== 1) throw new Error("Fixture owner has unexpected projects");
    await db.user.delete({ where: { id: project.ownerUserId } });
  }
  return { exists: true, cleaned: cleanup, items: items.map(item => ({ status: item.status, accepted: item.acceptedAt !== null, reports: item.reports.length })),
    runs: runs.map(run => ({ agent: run.agent, step: run.stepId, closed: run.closedAt !== null, refused: run.refused, steps: run.steps.map(step => ({ step: step.stepId, outcome: step.outcome, accepted: step.accepted })) })) };
});
console.log(JSON.stringify(result));

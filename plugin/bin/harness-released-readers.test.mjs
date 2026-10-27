import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { it } from "node:test";
import { fileURLToPath } from "node:url";
import { markUnsettled, residentLock } from "../runtime/local-session.mjs";

const REPOSITORY = fileURLToPath(new URL("../..", import.meta.url));
const CURRENT_PLUGIN = fileURLToPath(new URL("..", import.meta.url));
const MANIFEST = "plugin/.claude-plugin/plugin.json";
const READER = "plugin/bin/harness-background.mjs";
const FIRST_RESIDENT_RELEASE = "0.5.14";
const READER_ENV = Object.fromEntries(Object.entries(process.env).filter(([key]) =>
  !key.startsWith("HARNESS_") && !key.startsWith("GIT_") && !key.startsWith("STAGEKEEPER_") && key !== "NODE_OPTIONS"));

const git = (args, env = process.env) => execFileSync("git", ["-C", REPOSITORY, ...args],
  { encoding: "utf8", env, stdio: ["ignore", "pipe", "pipe"], maxBuffer: 1 << 26, windowsHide: true }).trim();
const attempt = args => { try { return git(args); } catch { return null; } };

function releasedReaders() {
  if (!attempt(["rev-parse", "--verify", "--quiet", "origin/main^{commit}"])) return null;
  const bumps = git(["log", "--first-parent", "--format=%H", "origin/main", "--", MANIFEST]).split("\n").filter(Boolean);
  const readers = [], versions = new Set(), sources = new Set();
  bumps.forEach((bump, index) => {
    const commit = git(["rev-parse", index === 0 ? "origin/main" : `${bumps[index - 1]}^1`]);
    const manifest = attempt(["show", `${commit}:${MANIFEST}`]);
    const version = manifest && JSON.parse(manifest).version;
    if (!version || versions.has(version)) return;
    versions.add(version);
    if (attempt(["cat-file", "-e", `${commit}:${READER}`]) === null) return;
    const source = ["bin", "runtime", "lib"].map(part => attempt(["rev-parse", `${commit}:plugin/${part}`])).join(" ");
    if (sources.has(source)) return;
    sources.add(source);
    readers.push({ version, commit });
  });
  return readers;
}

function extractPlugin(commit, scratch) {
  const target = path.join(scratch, commit).replaceAll("\\", "/");
  const env = { ...process.env, GIT_INDEX_FILE: path.join(scratch, `${commit}.index`) };
  git(["read-tree", "--prefix=plugin/", `${commit}:plugin`], env);
  git(["checkout-index", "--all", `--prefix=${target}/`], env);
  return path.join(target, "plugin");
}

const deadPid = () => spawnSync(process.execPath, ["-e", ""], { windowsHide: true }).pid;
const child = pid => ({ pid, nonce: randomUUID() });
const crashed = lock => {
  lock.poller = child(deadPid());
  lock.children.push(child(deadPid()));
  return lock;
};
const lockFor = (repository, client) => residentLock({ session: randomUUID(), client, host: "test", at: new Date().toISOString(),
  binding: { root: repository, server: "http://127.0.0.1:9", project: "test", configHash: "a".repeat(64), tokenHash: "b".repeat(64) } });

const UNRECLAIMABLE = {
  "a crashed Codex runner": repository => crashed(lockFor(repository, "codex")),
  "an unsettled Codex runner": repository => markUnsettled(crashed(lockFor(repository, "codex"))),
  "an unsettled Claude runner": repository => markUnsettled(crashed(lockFor(repository, "claude"))),
};

function install(repository, lock) {
  const directory = path.join(repository, ".git", "harness");
  mkdirSync(directory, { recursive: true });
  writeFileSync(path.join(directory, "watch.json"), JSON.stringify({ schemaVersion: 1, session: lock.id, commit: true, propose: false }) + "\n");
  writeFileSync(path.join(directory, "watch.lock.json"), JSON.stringify(lock) + "\n");
}
const installedLock = repository => {
  try { return JSON.parse(readFileSync(path.join(repository, ".git", "harness", "watch.lock.json"), "utf8")); } catch { return null; }
};

function runReader(plugin, script, args, repository) {
  const file = path.join(plugin, "bin", script);
  if (!existsSync(file)) return null;
  const result = spawnSync(process.execPath, [file, ...args, "--root", repository], { encoding: "utf8", env: READER_ENV, windowsHide: true, timeout: 60_000 });
  const events = `${result.stdout}\n${result.stderr}`.split(/\r?\n/).flatMap(line => {
    try { const value = JSON.parse(line); return value?.event ? [value] : []; } catch { return []; }
  });
  return events.at(-1) ?? { event: "none", exit: result.status, stderr: result.stderr.slice(0, 500) };
}

function checkReader(t, version, plugin) {
  const repository = mkdtempSync(path.join(realpathSync.native(tmpdir()), "harness-released-reader-"));
  t.after(() => rmSync(repository, { recursive: true, force: true }));
  execFileSync("git", ["init", "-q", repository], { stdio: "ignore", windowsHide: true });

  for (const [shape, build] of Object.entries(UNRECLAIMABLE)) {
    const lock = build(repository);
    install(repository, lock);
    for (const [script, args] of [["harness-session.mjs", ["--release", "--session", lock.id]], ["harness-watch.mjs", ["--stop", "--session", lock.id]],
      ["harness-background.mjs", ["--status"]], ["harness-background.mjs", ["--stop"]]]) {
      const event = runReader(plugin, script, args, repository);
      assert.equal(installedLock(repository)?.id, lock.id, `${version} ${script} ${args[0]} removed ${shape}: ${JSON.stringify(event)}`);
      if (args[0] === "--status") assert.equal(event?.session, lock.id, `${version} status lost ${shape}: ${JSON.stringify(event)}`);
    }
  }

  const live = lockFor(repository, "codex");
  live.poller = child(process.pid);
  install(repository, live);
  const status = runReader(plugin, "harness-background.mjs", ["--status"], repository);
  assert.equal(status.running, true, `${version} status: ${JSON.stringify(status)}`);
  const stopping = runReader(plugin, "harness-background.mjs", ["--stop"], repository);
  assert.deepEqual([stopping.event, installedLock(repository)?.id, installedLock(repository)?.lifecycle], ["stopping", live.id, "stopping"],
    `${version} stop of a live Codex runner: ${JSON.stringify(stopping)}`);

  const reclaimable = crashed(lockFor(repository, "claude"));
  install(repository, reclaimable);
  const stopped = runReader(plugin, "harness-background.mjs", ["--stop"], repository);
  assert.deepEqual([stopped.event, installedLock(repository)], ["stopped", null], `${version} kept a crashed Claude runner: ${JSON.stringify(stopped)}`);
}

const readers = releasedReaders();
const historyMissing = readers === null && process.env.STAGEKEEPER_RELEASED_READERS !== "required" ? "origin/main history is unavailable" : false;

it("current readers keep unsettled and Codex locks and still stop and reclaim the rest", t => {
  checkReader(t, "current", CURRENT_PLUGIN);
});

it("released readers keep unsettled and Codex locks and still stop and reclaim the rest", { skip: historyMissing }, t => {
  assert.ok(readers, "origin/main history is required to find the released readers");
  assert.ok(readers.some(reader => reader.version === FIRST_RESIDENT_RELEASE), `released readers: ${readers.map(reader => reader.version).join(", ")}`);
  t.diagnostic(`released readers: ${readers.map(reader => reader.version).join(", ")}`);
  const scratch = mkdtempSync(path.join(realpathSync.native(tmpdir()), "harness-released-plugins-"));
  t.after(() => rmSync(scratch, { recursive: true, force: true }));
  for (const reader of readers) checkReader(t, reader.version, extractPlugin(reader.commit, scratch));
});

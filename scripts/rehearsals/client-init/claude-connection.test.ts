import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { it, type TestContext } from "node:test";
import { Run } from "../support/command-run";
import { Smoke, marketplaceSource, update, type Plugin } from "./claude-connection";
import type { Options } from "./options";

function fixture(t: TestContext, version: string) {
  const work = mkdtempSync(path.join(realpathSync.native(tmpdir()), "claude-update-"));
  t.after(() => rmSync(work, { recursive: true, force: true }));
  const previous: Plugin = { root: path.join(work, "previous"), commit: "a".repeat(40) };
  const current: Plugin = { root: path.join(work, "current"), commit: "b".repeat(40) };
  mkdirSync(path.join(previous.root, ".claude-plugin"), { recursive: true });
  writeFileSync(path.join(previous.root, ".claude-plugin/plugin.json"), JSON.stringify({ version }));
  const run = new Run(path.join(work, "commands.log"));
  const smoke = new Smoke(run, work, { NODE_ENV: "test" }, "fixture-user", "unused-fixture-db", "http://127.0.0.1:45000");
  const events: string[] = [];
  const syncedAt = new Date("2026-01-01T00:00:00.000Z");
  smoke.firstConnection = async (plugin, prefix, scenario, token) => {
    assert.equal(plugin, previous);
    assert.equal(prefix, "previous-");
    assert.equal(scenario, "update");
    assert.equal(token, "fixture-token");
    events.push("previous-connection");
    return { slug: "fixture", syncedAt };
  };
  smoke.connected = async name => {
    assert.equal(name, "mcp-unchanged");
    events.push("connected");
  };
  smoke.dryRun = async (plugin, name, plan) => {
    assert.equal(plugin, current);
    assert.equal(name, "update-dry-run");
    assert.equal(plan, "free");
    events.push("dry-run");
  };
  smoke.generate = async (plugin, name, plan) => {
    assert.equal(plugin, current);
    assert.equal(name, "update-generate");
    assert.equal(plan, "free");
    events.push("generate");
  };
  smoke.sync = async (plugin, name, slug, after) => {
    assert.equal(plugin, current);
    assert.equal(name, "update-sync");
    assert.equal(slug, "fixture");
    assert.equal(after, syncedAt);
    events.push("sync");
    return new Date(syncedAt.getTime() + 1);
  };
  const options: Options = {
    client: "claude", scenario: "update", templates: work,
    pluginSource: "github-branch", pluginCommit: current.commit, pluginBranch: "fixture",
    previousRef: previous.commit, allowMachineChanges: false, help: false,
  };
  const install = async () => { events.push("install"); return current; };
  const cutover = async () => { events.push("cutover"); };
  return { previous, current, run, smoke, events, options, install, cutover };
}

for (const [version, first] of [
  ["0.5.33", ["previous-connection", "cutover"]],
  ["0.6.0", ["cutover", "previous-connection"]],
] as const) {
  it("preserves template cutover order when updating from " + version, async t => {
    const f = fixture(t, version);
    const result = await update(f.smoke, f.previous, f.install, f.options, "fixture-token", f.cutover);
    assert.equal(result, f.current);
    assert.deepEqual(f.events, [...first, "install", "connected", "dry-run", "generate", "sync"]);
    assert.deepEqual(f.run.steps, [{ step: "plugin-install", result: "pass" }]);
  });
}

it("starts no previous connection or install after release cutover fails", async t => {
  const f = fixture(t, "0.6.0"), failure = new Error("cutover refused");
  await assert.rejects(update(f.smoke, f.previous, f.install, f.options, "fixture-token", async () => {
    f.events.push("cutover");
    throw failure;
  }), error => error === failure);
  assert.deepEqual(f.events, ["cutover"]);
  assert.deepEqual(f.run.steps, []);
});

it("keeps installation failure and does not reconnect or generate afterward", async t => {
  const f = fixture(t, "0.6.0"), failure = new Error("install failed");
  await assert.rejects(update(f.smoke, f.previous, async () => {
    f.events.push("install");
    throw failure;
  }, f.options, "fixture-token", f.cutover), error => error === failure);
  assert.deepEqual(f.events, ["cutover", "previous-connection", "install"]);
  assert.equal(f.run.failure, "plugin-install");
  assert.deepEqual(f.run.steps, [{ step: "plugin-install", result: "fail" }]);
});

it("adds the marketplace pinned to the commit under test, so a branch that moves during a run cannot change what is installed", () => {
  const commit = "c".repeat(40);
  assert.equal(marketplaceSource(commit), `https://github.com/Sangeok/stagekeeper.git#${commit}`);
});

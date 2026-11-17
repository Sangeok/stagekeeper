import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { runPrCommand } from "../index.mjs";
import { digest, json } from "../git-workspace.mjs";

export function fixture(t, { native = false } = {}) {
  const directory = fs.mkdtempSync(path.join(fs.realpathSync.native(os.tmpdir()), "pr-closeout-test-"));
  const children = [];
  const ownChild = child => {
    children.push({ child, closed: new Promise(resolve => child.once("close", resolve)) });
    return child;
  };
  t.after(async () => {
    for (const owned of children) {
      if (owned.child.exitCode === null && owned.child.signalCode === null) owned.child.kill("SIGKILL");
      await owned.closed;
    }
    fs.rmSync(directory, { recursive: true, force: true, maxRetries: 3 });
  });
  const original = { ...process.env };
  for (const key of Object.keys(process.env)) if (key.toUpperCase().startsWith("GIT_")) delete process.env[key];
  process.env.GIT_CONFIG_NOSYSTEM = "1";
  process.env.GIT_CONFIG_GLOBAL = path.join(directory, "gitconfig");
  fs.writeFileSync(process.env.GIT_CONFIG_GLOBAL, "");
  t.after(() => { for (const key of Object.keys(process.env)) delete process.env[key]; Object.assign(process.env, original); });
  const root = path.join(directory, "control"), origin = path.join(directory, "origin.git");
  fs.mkdirSync(root);
  const git = (args, cwd = root) => execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();
  git(["init", "--bare", origin]); git(["init", "--initial-branch=main"]);
  git(["config", "user.name", "Fixture"]); git(["config", "user.email", "fixture@example.test"]);
  git(["config", "core.autocrlf", "false"]);
  git(["config", "url." + origin.replaceAll("\\", "/") + ".insteadOf", "https://github.com/fixture/stagekeeper.git"]);
  git(["remote", "add", "origin", "https://github.com/fixture/stagekeeper.git"]);
  fs.writeFileSync(path.join(root, "README.md"), "fixture\n");
  fs.writeFileSync(path.join(root, ".gitignore"), "node_modules/\n.next/\ncoverage/\n.env\n*.log\nsrc/generated/\nnext-env.d.ts\ntsconfig.tsbuildinfo\n");
  git(["add", "."]); git(["commit", "-m", "base"]); git(["branch", "dev"]); git(["push", "origin", "main", "dev"]);
  const base = git(["rev-parse", "HEAD"]), common = path.join(root, ".git");
  let now = 0, usageCalls = 0;
  const repository = { id: 42, full_name: "fixture/stagekeeper", archived: false, disabled: false };
  const state = { pr: null, puts: 0, gets: [], mode: "merge", checks: null, readiness: { mergeable: "MERGEABLE", mergeStateStatus: "CLEAN", reviewDecision: "", required: [{ bucket: "pass" }] }, mutate: null, dependency: false };
  const github = {
    async request(method, endpoint, body) {
      if (method === "PUT") {
        state.puts++; assert.equal(body.sha, state.pr.head.sha); assert.equal(body.merge_method, "merge");
        if (state.mode === "reject") return { status: 405, data: { message: "blocked" } };
        if (state.mode === "unknown") throw new Error("transport lost");
        mergeRemote();
        if (state.mode === "lost") throw new Error("response lost");
        return { status: 200, data: { merged: true, sha: state.pr.merge_commit_sha } };
      }
      state.gets.push(endpoint);
      const suffix = endpoint.replace("repos/fixture/stagekeeper", "");
      if (suffix === "") return { status: 200, data: structuredClone(repository) };
      if (suffix.startsWith("/pulls?")) return { status: 200, data: state.dependency ? [{ number: 999 }] : [] };
      if (suffix === "/pulls/1") return { status: 200, data: structuredClone(state.pr) };
      if (suffix === "/git/ref/heads/dev") return { status: 200, data: { ref: "refs/heads/dev", object: { type: "commit", sha: git(["rev-parse", "dev"], origin) } } };
      if (suffix.startsWith("/actions/")) {
        const head = state.pr.head;
        const runs = state.checks ?? [{ id: 10, run_number: 1, run_attempt: 1, head_sha: head.sha, head_branch: head.ref, head_repository: repository,
          path: ".github/workflows/check.yml", event: "pull_request", status: "completed", conclusion: "success",
          pull_requests: [{ number: 1, head: { sha: head.sha, ref: head.ref }, base: { ref: "dev" } }] }];
        return { status: 200, data: { total_count: runs.length, workflow_runs: structuredClone(runs) } };
      }
      throw new Error("Unexpected fixture route " + endpoint);
    },
    async readiness() { if (state.mutate) await state.mutate(); return structuredClone(state.readiness); },
  };
  const ports = { github, sourceRevision: async () => base, clock: () => now, sleep: async ms => { now += ms; } };
  if (!native) ports.inspectUsage = async () => { usageCalls++; return { status: "unknown", capability: { status: "unqualified", profile: null }, observationPerformed: false, observation: { coverageComplete: false }, observer: { state: "not-started" } }; };
  const run = options => runPrCommand({ root, ...options }, ports);
  async function bootstrap() {
    const preview = await run({ operation: "migrate", action: "preview" });
    assert.equal(preview.exitCode, 0, json(preview));
    const plan = preview.plan;
    const file = path.join(directory, "plan-" + randomUUID() + ".json"); fs.writeFileSync(file, json(plan));
    const options = { operation: "migrate", action: "apply", plan: file, expectedPlanDigest: digest(json(plan)), expectedMigrationState: "absent", writersQuiescent: true, ownersConfirmed: true };
    const applied = await run(options); assert.equal(applied.exitCode, 0, json(applied)); return { options, applied, plan, file };
  }
  async function create(name = "task") {
    const result = await run({ operation: "create", owner: "fixture", branch: "harness/" + name, path: path.join(directory, name) });
    assert.equal(result.exitCode, 0, json(result)); return result;
  }
  function commit(task, content = "change\n") {
    fs.writeFileSync(path.join(task.path, "change.txt"), content);
    git(["add", "."], task.path); git(["commit", "-m", "task"], task.path);
    const head = git(["rev-parse", "HEAD"], task.path); git(["push", "origin", task.branchName], task.path); return head;
  }
  function pr(task, head) {
    state.pr = { number: 1, state: "open", merged: false, draft: false, merge_commit_sha: null,
      head: { ref: task.branchName, sha: head, repo: repository }, base: { ref: "dev", repo: repository } };
  }
  function mergeRemote() {
    const head = state.pr.head.sha;
    git(["update-ref", "refs/heads/dev", head], origin);
    state.pr.state = "closed"; state.pr.merged = true; state.pr.merge_commit_sha = head;
  }
  function effect(task, head, operation = "complete", extra = {}) {
    return { operation, task: task.task, owner: task.owner, expectedState: task.state, expectedHead: head, expectedInstance: task.instance, requestId: randomUUID(),
      ...(operation === "complete" ? { pr: 1, usageEnded: true } : operation === "retire" ? { usageEnded: true } : {}), ...extra };
  }
  function absent(target) { assert.equal(fs.existsSync(target), false); }
  return { directory, root, origin, common, git, base, state, ports, run, bootstrap, create, commit, pr, mergeRemote, effect, absent, ownChild, usageCalls: () => usageCalls };
}

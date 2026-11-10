import assert from "node:assert/strict";
import { execFile, execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { it } from "node:test";
import { fileURLToPath } from "node:url";
import { gitRoot, startSession, stateFiles } from "../runtime/local-session.mjs";
import { commitGuardReason } from "./harness-commit-guard.mjs";

const GUARD = fileURLToPath(new URL("./harness-commit-guard.mjs", import.meta.url));
const HOOKS = fileURLToPath(new URL("../hooks/hooks.json", import.meta.url));
const POLICY_REFUSAL = "Stagekeeper: this session's commit policy is no. Leave the changes uncommitted and report them; the owner commits.";
const reportRefusal = agent => `Stagekeeper: ${agent} does not commit. Leave the file uncommitted and send agent_next outcome handoff with its path as note; the main loop commits it.`;

function checkout(t, workspaces = [{ id: "app", path: ".", agent: "dev", verify: ["node --test"] }]) {
  const root = realpathSync.native(mkdtempSync(path.join(tmpdir(), "harness-commit-guard-")));
  t.after(() => rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }));
  execFileSync("git", ["init", "-q", path.join(root, "repo")]);
  const repo = path.join(root, "repo");
  if (workspaces) writeFileSync(path.join(repo, "harness.json"), JSON.stringify({ version: 1, project: { owner: "o", repo: "r", branch: "main", slug: "p" }, workspaces }));
  return { root, repo };
}

async function session(repo, commit) {
  const location = gitRoot(repo);
  await startSession(stateFiles(location.directory), { root: location.root, server: "http://127.0.0.1:1", project: "p", configHash: "1".repeat(64), tokenHash: "2".repeat(64) },
    { client: "claude", commit, propose: false });
}

const call = (agent, command, { tool = "Bash", cwd, subagent = true } = {}) => ({ hook_event_name: "PreToolUse", session_id: "s", tool_name: tool, tool_input: { command },
  ...(cwd ? { cwd } : {}), ...(agent ? { agent_type: agent } : {}), ...(subagent ? { agent_id: "a1" } : {}) });

it("refuses commits and staging from a report role in each command form, and leaves its other Git commands alone", t => {
  const { repo } = checkout(t), env = { CLAUDE_PROJECT_DIR: repo };
  const refused = [
    ["Bash", "git commit -m x"],
    ["Bash", `git -C "${repo}" commit -m x`],
    ["Bash", "git -c user.name=x -c user.email=x@example.invalid commit -m x"],
    ["Bash", `cd "${repo}" && git add f && git commit -m x`],
    ["Bash", "git status\ngit commit -m x"],
    ["Bash", "git.exe commit -m x"],
    ["Bash", "\"/c/Program Files/Git/cmd/git.exe\" add f"],
    ["Bash", "GIT_AUTHOR_NAME=x git commit -m x"],
    ["Bash", "git --no-pager --git-dir=.git --work-tree . add f"],
    ["Bash", "(cd sub && git add f)"],
    ["Bash", "if git commit -m x; then echo done; fi"],
    ["Bash", "echo $(git add f)"],
    ["Bash", "bash -c \"git commit -m x\""],
    ["Bash", "git diff | cat; git add -A"],
    ["PowerShell", "& git commit -m x"],
    ["PowerShell", "& 'C:\\Program Files\\Git\\cmd\\git.exe' add f"],
    ["PowerShell", "git add f; git commit -m x"],
    ["PowerShell", "if ($?) { git commit -m x }"],
    ["PowerShell", "pwsh -NoProfile -Command \"git commit -m x\""],
  ];
  const allowed = [
    ["Bash", `git -C "${repo}" rev-parse HEAD`],
    ["Bash", "git diff"],
    ["Bash", "git checkout 0123abc -- src/a.mjs"],
    ["Bash", "grep \"git commit\" notes.md"],
    ["Bash", "echo 'git add f' > notes.md"],
    ["Bash", "git status # later; git add f"],
    ["Bash", "git log --grep=commit --oneline"],
    ["Bash", "node scripts/harness-role-git.mjs commit"],
    ["PowerShell", "Write-Output \"git commit -m x\""],
    ["PowerShell", "git status; git log -1 --format=%s"],
  ];

  for (const [tool, command] of refused) assert.equal(commitGuardReason(call("impl-verifier", command, { tool }), env), reportRefusal("impl-verifier"), command);
  for (const [tool, command] of allowed) assert.equal(commitGuardReason(call("impl-verifier", command, { tool }), env), null, command);
  assert.equal(commitGuardReason(call("plan-verifier", "git add docs/agents/plan-verifier/ITEM-1.md"), env), reportRefusal("plan-verifier"));
});

it("leaves the main session, a session started as an agent, other subagents and unconnected repositories alone", t => {
  const { repo } = checkout(t), unconnected = checkout(t, null).repo, env = { CLAUDE_PROJECT_DIR: repo };

  assert.equal(commitGuardReason(call(null, "git commit -m x", { subagent: false }), env), null);
  assert.equal(commitGuardReason(call("impl-verifier", "git commit -m x", { subagent: false }), env), null);
  assert.equal(commitGuardReason(call("general-purpose", "git commit -m x"), env), null);
  assert.equal(commitGuardReason({ ...call("impl-verifier", "git commit -m x"), tool_name: "Write" }, env), null);
  assert.equal(commitGuardReason(call("impl-verifier", "git commit -m x"), { CLAUDE_PROJECT_DIR: unconnected }), null);
  assert.equal(commitGuardReason(call("impl-verifier", "git commit -m x", { cwd: path.dirname(repo) }), {}), null);
});

it("refuses a workspace role's commit only while this checkout's session policy is commit no", async t => {
  const { repo } = checkout(t), other = checkout(t).repo, env = { CLAUDE_PROJECT_DIR: repo }, commit = call("dev", "git add src/a.mjs && git commit -m x");

  assert.equal(commitGuardReason(commit, env), null);
  await session(repo, false);
  assert.equal(commitGuardReason(commit, env), POLICY_REFUSAL);
  assert.equal(commitGuardReason(call("dev", "git status"), env), null);
  assert.equal(commitGuardReason(call("web-dev", "git commit -m x"), env), null);
  await session(other, true);
  assert.equal(commitGuardReason(commit, { CLAUDE_PROJECT_DIR: other }), null);
});

it("finds the checkout and its session policy from a subdirectory, a linked worktree or the call's working directory", async t => {
  const { root, repo } = checkout(t), worktree = path.join(root, "worktree");
  execFileSync("git", ["-C", repo, "-c", "user.name=t", "-c", "user.email=t@example.invalid", "commit", "-q", "--allow-empty", "-m", "init"]);
  execFileSync("git", ["-C", repo, "worktree", "add", "-q", "-b", "side", worktree]);
  writeFileSync(path.join(worktree, "harness.json"), readFileSync(path.join(repo, "harness.json")));
  mkdirSync(path.join(worktree, "sub")); mkdirSync(path.join(repo, "sub"));
  await session(repo, false);

  assert.equal(commitGuardReason(call("dev", "git commit -m x"), { CLAUDE_PROJECT_DIR: path.join(worktree, "sub") }), POLICY_REFUSAL);
  assert.equal(commitGuardReason(call("dev", "git commit -m x", { cwd: path.join(repo, "sub") }), {}), POLICY_REFUSAL);
  assert.equal(commitGuardReason(call("impl-verifier", "git commit -m x", { cwd: path.join(worktree, "sub") }), {}), reportRefusal("impl-verifier"));
});

function hook(input, env = {}) {
  const inherited = Object.fromEntries(Object.entries(process.env).filter(([key]) => key.toUpperCase() !== "CLAUDE_PROJECT_DIR"));
  return new Promise((resolve, reject) => {
    const child = execFile(process.execPath, [GUARD], { env: { ...inherited, ...env }, windowsHide: true }, (error, stdout) => error ? reject(error) : resolve(JSON.parse(stdout)));
    child.stdin.end(input);
  });
}

it("answers the hook with a deny decision, and with no decision when it cannot read the call or the checkout", async t => {
  const { repo } = checkout(t), env = { CLAUDE_PROJECT_DIR: repo };

  assert.deepEqual(await hook(JSON.stringify(call("impl-verifier", "git commit -m x")), env),
    { hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: reportRefusal("impl-verifier") } });
  assert.deepEqual(await hook("\uFEFF" + JSON.stringify(call("impl-verifier", "git commit -m x")), env),
    { hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: reportRefusal("impl-verifier") } });
  assert.deepEqual(await hook(JSON.stringify(call(null, "git commit -m x", { subagent: false })), env), {});
  assert.deepEqual(await hook("{", env), {});
  mkdirSync(path.join(repo, ".git", "harness"));
  writeFileSync(path.join(repo, ".git", "harness", "watch.json"), "{");
  assert.deepEqual(await hook(JSON.stringify(call("dev", "git commit -m x")), env), {});
  writeFileSync(path.join(repo, "harness.json"), "{");
  assert.deepEqual(await hook(JSON.stringify(call("impl-verifier", "git commit -m x")), env), {});
});

it("registers the guard for shell calls that mention a commit or staging, and lets the call run when the guard fails", () => {
  const groups = JSON.parse(readFileSync(HOOKS, "utf8")).hooks.PreToolUse;
  const handler = { type: "command", command: "node", args: ["${CLAUDE_PLUGIN_ROOT}/bin/harness-commit-guard.mjs"], timeout: 10, onFailure: "continue" };

  assert.deepEqual(groups.filter(group => group.hooks.some(entry => entry.args?.[0]?.endsWith("/harness-commit-guard.mjs"))), [{ matcher: "^(Bash|PowerShell)$",
    hooks: ["Bash(*git*commit*)", "Bash(*git*add*)", "PowerShell(*git*commit*)", "PowerShell(*git*add*)"].map(condition => ({ ...handler, if: condition })) }]);
});

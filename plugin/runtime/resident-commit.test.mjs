import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import fs from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { it } from "node:test";
import { commitResidentArtifacts, ResidentCommitInputError } from "./resident-commit.mjs";
import { createMainLoopBridge } from "./codex-main-loop.mjs";

function fixture(t) {
  const root = mkdtempSync(path.join(realpathSync(tmpdir()), "resident-commit-test-"));
  t.after(() => rmSync(root, { recursive: true }));
  const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8", windowsHide: true, stdio: "pipe" }).trim();
  const write = (name, content) => { mkdirSync(path.dirname(path.join(root, name)), { recursive: true }); writeFileSync(path.join(root, name), content); return { path: name, hash: createHash("sha256").update(content).digest("hex") }; };
  git("init", "-q", "--initial-branch=fixture"); git("config", "user.name", "Test"); git("config", "user.email", "test@example.test"); git("config", "core.autocrlf", "false");
  write("src/main.mjs", "export const value = 1;\n"); git("add", "."); git("commit", "-qm", "baseline");
  const input = { root, branch: "fixture", key: "K-1", next: { key: "K-1", action: "wait", on: "handoff", note: "docs/plans/K-1.md", resume: { key: "K-1", agent: "dev" } },
    board: { status: "planning" }, workspaces: [{ agent: "dev", path: ".", readOnly: ["src/readonly"] }] };
  return { root, git, write, input, commit: files => commitResidentArtifacts({ ...input, files }) };
}

it("returns a correctable artifact path error through HTTP without modifying Git, then accepts relative paths", async t => {
  const f = fixture(t), artifact = f.write("docs/plans/K-1.md", "plan\n"), before = f.git("rev-parse", "HEAD");
  const bridge = await createMainLoopBridge({ tools: [], call: (_, args) => f.commit(args.files) }, new AbortController().signal);
  t.after(() => bridge.close());
  const invoke = async files => (await fetch(bridge.url, { method: "POST", body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "resident_commit", arguments: { files } } }) })).json();
  assert.throws(() => f.commit([]), /Explicit artifact/);
  assert.throws(() => f.commit([{ ...artifact, path: path.join(f.root, artifact.path) }]), ResidentCommitInputError);
  const rejected = await invoke([{ ...artifact, path: path.join(f.root, artifact.path) }]);
  assert.equal(rejected.error.code, -32602);
  assert.match(rejected.error.message, /docs\/plans\/K-1.md.*repository-relative/);
  assert.equal(f.git("rev-parse", "HEAD"), before);
  assert.equal(existsSync(path.join(f.root, ".git/index.lock")), false);
  const accepted = await invoke([artifact]);
  assert.equal(accepted.error, undefined);
  assert.notEqual(JSON.parse(accepted.result.content[0].text).commit, before);
});

it("commits exact artifact bytes with hooks and clean filters disabled, preserving unrelated unstaged work", t => {
  const f = fixture(t), bytes = "  # Plan\r\n\r\nexact trailing whitespace  \r\n", artifact = f.write("docs/plans/K-1.md", bytes);
  f.write("src/main.mjs", "export const value = 2;\n");
  f.write(".gitattributes", "*.md filter=refuse\n");
  f.git("config", "filter.refuse.clean", "exit 1"); f.git("config", "filter.refuse.required", "true");
  for (const hook of ["pre-commit", "post-commit", "reference-transaction"]) f.write("hooks/" + hook, "#!/bin/sh\nexit 1\n");
  f.git("config", "core.hooksPath", path.join(f.root, "hooks"));
  const result = f.commit([artifact]);
  assert.equal(execFileSync("git", ["cat-file", "blob", result.commit + ":" + artifact.path], { cwd: f.root, encoding: "utf8", windowsHide: true }), bytes);
  assert.equal(f.git("diff", "--cached", "--name-only"), "");
  assert.equal(readFileSync(path.join(f.root, "src/main.mjs"), "utf8"), "export const value = 2;\n");
  assert.equal(f.git("show", result.commit + ":src/main.mjs"), "export const value = 1;");
  assert.equal(existsSync(path.join(f.root, ".git/index.lock")), false);
  assert.equal(f.commit([artifact]).commit, result.commit);
});

it("preserves an existing index and branch when other work is staged", t => {
  const f = fixture(t), artifact = f.write("docs/plans/K-1.md", "plan\n");
  f.write("src/main.mjs", "staged\n"); f.git("add", "src/main.mjs");
  const index = readFileSync(path.join(f.root, ".git/index")), head = f.git("rev-parse", "HEAD");
  assert.throws(() => f.commit([artifact]), /staged work/);
  assert.deepEqual(readFileSync(path.join(f.root, ".git/index")), index);
  assert.equal(f.git("rev-parse", "HEAD"), head);
  assert.equal(existsSync(path.join(f.root, ".git/index.lock")), false);
});

it("accepts an in-repository absolute handoff note and rejects a note outside the owned root", t => {
  const f = fixture(t), artifact = f.write("docs/plans/K-1.md", "plan\n"), head = f.git("rev-parse", "HEAD");
  f.input.next.note = path.resolve(f.root, "../docs/plans/K-1.md");
  assert.throws(() => f.commit([artifact]), /escapes the root/);
  assert.equal(f.git("rev-parse", "HEAD"), head);
  f.input.next.note = path.join(f.root, artifact.path);
  const result = f.commit([artifact]);
  assert.equal(result.path, artifact.path);
  assert.equal(f.git("show", result.commit + ":" + artifact.path), "plan");
});

it("preserves Windows read-only, managed and other-workspace files across case aliases", { skip: process.platform !== "win32" }, t => {
  const f = fixture(t), artifact = f.write("docs/agents/dev/K-1.md", "report\n");
  f.input.next.note = artifact.path; f.input.board.status = "implementing";
  f.input.workspaces.push({ agent: "other", path: "src/other", readOnly: [] });
  const readonly = f.write("src/readonly/value.mjs", "readonly\n"), other = f.write("src/other/value.mjs", "other\n"), managed = f.write("HARNESS.JSON", "managed\n");
  const head = f.git("rev-parse", "HEAD");
  for (const file of [{ ...readonly, path: "src/READONLY/value.mjs" }, { ...other, path: "src/OTHER/value.mjs" }, managed]) {
    assert.throws(() => f.commit([artifact, file]), /Commit path/);
    assert.equal(f.git("rev-parse", "HEAD"), head);
  }
  const source = f.write("src/main.mjs", "changed\n");
  assert.throws(() => f.commit([artifact, { ...source, path: "src/MAIN.mjs" }]), /Noncanonical/);
  assert.equal(f.git("rev-parse", "HEAD"), head);
  assert.equal(f.git("diff", "--cached", "--name-only"), "");
});

it("refuses stale hashes, wrong handoffs, managed documents, read-only scopes and another workspace", t => {
  const f = fixture(t), artifact = f.write("docs/agents/dev/K-1.md", "report\n");
  f.input.next.note = artifact.path; f.input.board.status = "implementing";
  f.input.workspaces.push({ agent: "other", path: "src/other", readOnly: [] });
  const head = f.git("rev-parse", "HEAD");
  for (const name of ["docs/plans/K-2.md", "docs/agents/main-loop/K-1.md", "docs/harness/x.md", "src/readonly/x.mjs", "src/other/x.mjs", "harness.json", ".env.test"]) {
    assert.throws(() => f.commit([artifact, f.write(name, "unrelated\n")]), /Commit path/);
  }
  assert.throws(() => f.commit([{ ...artifact, hash: "0".repeat(64) }]), /changed/);
  f.input.next.note = "src/main.mjs"; assert.throws(() => f.commit([artifact]), /artifact path/);
  f.input.next.note = artifact.path; f.input.next.key = "K-2"; assert.throws(() => f.commit([artifact]), /Current handoff/);
  assert.equal(f.git("rev-parse", "HEAD"), head); assert.equal(f.git("diff", "--cached", "--name-only"), "");
});

it("permits current implementation files with the report and only the current acceptance report at accept", t => {
  const f = fixture(t), report = f.write("docs/agents/dev/K-1.md", "report\n"), code = f.write("src/main.mjs", "export const value = 2;\n");
  f.input.next.note = report.path; f.input.board.status = "implementing";
  const result = f.commit([report, code]); assert.equal(f.git("show", result.commit + ":src/main.mjs"), "export const value = 2;");
  const acceptance = f.write("docs/agents/main-loop/K-1.md", "checks 1–5\n"); f.input.next = { action: "accept", key: "K-1" };
  assert.throws(() => f.commit([acceptance, code]), /Commit path/);
  assert.equal(f.commit([acceptance]).path, acceptance.path);
});

it("retains the owned index lock if the commit publishes but final index installation fails", t => {
  const f = fixture(t), artifact = f.write("docs/plans/K-1.md", "plan\n"), before = f.git("rev-parse", "HEAD");
  const original = fs.renameSync;
  fs.renameSync = (source, target) => { if (path.resolve(String(source)) === path.join(f.root, ".git/index.lock")) throw new Error("Injected index installation failure"); return original(source, target); };
  syncBuiltinESMExports();
  try { assert.throws(() => f.commit([artifact]), /index installation failure/); }
  finally { fs.renameSync = original; syncBuiltinESMExports(); }
  assert.notEqual(f.git("rev-parse", "HEAD"), before);
  assert.equal(existsSync(path.join(f.root, ".git/index.lock")), true);
  assert.throws(() => f.commit([artifact]), /EEXIST/);
});

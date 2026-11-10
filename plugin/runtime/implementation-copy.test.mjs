import assert from "node:assert/strict";
import { it } from "node:test";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { prepareImplementationCopy } from "./implementation-copy.mjs";
import { createRoleFiles } from "./role-files.mjs";
import { createMacosCommands } from "./macos-commands.mjs";
import { installedMacosRuntime } from "./macos-runtime.mjs";

let runtime;
try { if (process.platform === "darwin") runtime = installedMacosRuntime(); } catch (error) { if (process.env.STAGEKEEPER_MACOS_RUNTIME_REQUIRED === "1") throw error; }
const native = { skip: !runtime && "Packaged macOS runtime required", timeout: 60000 };

it("implementation Git never restores or reads committed paths denied by the source file policy", native, async t => {
  const base = mkdtempSync(path.join(realpathSync(tmpdir()), "harness-implementation-policy-")), root = path.join(base, "repo");
  mkdirSync(root);
  t.after(() => rmSync(base, { recursive: true }));
  const git = args => execFileSync("git", ["-C", root, "-c", "maintenance.auto=false", "-c", "gc.auto=0", "-c", "user.name=Stagekeeper Test", "-c", "user.email=stagekeeper@test.invalid", ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  git(["init", "-q"]);
  const denied = [".azure/synthetic.json", "private/note.txt", ".env.test"];
  for (const name of [...denied, "allowed.txt"]) {
    mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    writeFileSync(path.join(root, name), "SYNTHETIC_POLICY_CANARY\n");
  }
  git(["add", "."]); git(["commit", "-qm", "policy fixture"]); const targetCommit = git(["rev-parse", "HEAD"]);
  const files = createRoleFiles({ ":root": "deny", [root]: "read", [path.join(root, "private")]: "deny" }, "impl-verifier");
  t.after(() => files.close());
  for (const name of denied) assert.throws(() => files.call("role_file_read", { path: path.join(root, name) }), /permission/);
  const copy = await prepareImplementationCopy({ root, targetCommit, planCommit: targetCommit, fileBroker: files, lifecycle: {} });
  t.after(() => copy.close());
  for (const name of denied) {
    for (const operation of ["show", "history", "restore"]) {
      await assert.rejects(copy.call({ operation, paths: [name] }), /permission|credentials|permitted/);
    }
    assert.equal(existsSync(path.join(copy.copy, name)), false);
    assert.ok(copy.omitted.some(value => name === value || name.startsWith(value + "/")));
  }
  assert.equal((await copy.call({ operation: "show", paths: ["allowed.txt"] })).text, "SYNTHETIC_POLICY_CANARY\n");
  assert.equal(git(["status", "--porcelain"]), "");
  await copy.close();
  assert.throws(() => files.resolveRead(path.join(root, "allowed.txt")), /closed/);
});

it("implementation verification observes baseline, assertion failure after revert and restored pass without touching the owner tree", native, async t => {
  const base = mkdtempSync(path.join(realpathSync(tmpdir()), "harness-implementation-test-")), root = path.join(base, "repo"), scratch = path.join(base, "scratch");
  mkdirSync(root); mkdirSync(scratch);
  t.after(() => rmSync(base, { recursive: true }));
  const git = args => execFileSync("git", ["-C", root, "-c", "maintenance.auto=false", "-c", "gc.auto=0", "-c", "user.name=Stagekeeper Test", "-c", "user.email=stagekeeper@test.invalid", ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  git(["init", "-q"]);
  writeFileSync(path.join(root, "sum.cjs"), "module.exports = (a, b) => a;\n");
  writeFileSync(path.join(root, "package.json"), JSON.stringify({ scripts: { test: "node --test sum.test.cjs" } }));
  mkdirSync(path.join(root, ".codex/agents"), { recursive: true });
  writeFileSync(path.join(root, ".codex/agents/fixture.toml"), "managed = true\n");
  git(["add", "."]); git(["commit", "-qm", "baseline"]); const planCommit = git(["rev-parse", "HEAD"]);
  writeFileSync(path.join(root, "sum.cjs"), "module.exports = (a, b) => a + b;\n");
  writeFileSync(path.join(root, "sum.test.cjs"), "require('node:test')('adds numbers',()=>require('node:assert/strict').equal(require('./sum.cjs')(1,2),3));\n");
  git(["add", "."]); git(["commit", "-qm", "implementation"]); const targetCommit = git(["rev-parse", "HEAD"]);
  const before = readFileSync(path.join(root, "sum.cjs")), index = readFileSync(path.join(root, ".git/index"));
  const sourceFiles = createRoleFiles({ ":root": "deny", [root]: "read", [scratch]: "write" }, "impl-verifier");
  const copy = await prepareImplementationCopy({ root, targetCommit, planCommit, fileBroker: sourceFiles, lifecycle: {} });
  t.after(() => copy.close());
  const files = createRoleFiles({ ":root": "deny", [copy.copy]: "write", [scratch]: "write" }, "impl-verifier");
  const commands = await createMacosCommands({ root: copy.copy, scratch, agent: "impl-verifier", fileBroker: files, runtime });
  t.after(() => commands.close());
  const identity = await copy.call({ operation: "identity" });
  assert.deepEqual([identity.head, identity.targetCommit, identity.planCommit, identity.planIsAncestor, identity.copy], [targetCommit, targetCommit, planCommit, true, copy.copy]);
  assert.equal(identity.scope, "permitted-files"); assert.ok(identity.omitted.includes(".codex/agents/fixture.toml"));
  assert.equal((await copy.call({ operation: "status" })).output, "");
  assert.equal((await commands.call("role_command_exec", { command: "npm test" })).exitCode, 0);
  const reverted = await copy.call({ operation: "restore", ref: "plan", paths: ["sum.cjs"] });
  assert.notEqual(reverted.changed[0].before, reverted.changed[0].after);
  assert.match((await copy.call({ operation: "status" })).output, /sum\.cjs/);
  const mutation = await commands.call("role_command_exec", { command: "npm test" });
  assert.notEqual(mutation.exitCode, 0); assert.match(mutation.stdout + mutation.stderr, /AssertionError|ERR_ASSERTION/);
  await copy.call({ operation: "restore", ref: "target", paths: ["sum.cjs"] });
  assert.equal((await commands.call("role_command_exec", { command: "npm test" })).exitCode, 0);
  assert.equal((await copy.call({ operation: "status" })).output, "");
  assert.ok((await copy.call({ operation: "status" })).omitted.includes(".codex/agents/fixture.toml"));
  await assert.rejects(copy.call({ operation: "restore", paths: [path.join(root, "sum.cjs")] }), /copy-relative/);
  await assert.rejects(copy.call({ operation: "show", paths: [".git/config"] }), /credentials/);
  assert.deepEqual(readFileSync(path.join(root, "sum.cjs")), before);
  assert.deepEqual(readFileSync(path.join(root, ".git/index")), index);
  assert.equal(git(["status", "--porcelain"]), "");
});

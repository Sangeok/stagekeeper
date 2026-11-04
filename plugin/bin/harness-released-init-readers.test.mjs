import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { it } from "node:test";
import { fileURLToPath } from "node:url";

const repository = fileURLToPath(new URL("../..", import.meta.url));
const releasedCommit = "f2d7196675f8ee6f7b21581eac83cdc7bc2c8ecf";
const git = (args, env = process.env) => execFileSync("git", ["-C", repository, ...args], { encoding: "utf8", env, stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
let available = true;
try { git(["cat-file", "-e", `${releasedCommit}:plugin/bin/harness-init.mjs`]); } catch { available = false; }

it("the exact released 0.5.33 init refuses both ready and pending v2 locks without changing generated files", {
  skip: !available && process.env.STAGEKEEPER_RELEASED_READERS !== "required" ? "Exact released init history is unavailable" : false,
}, t => {
  assert.ok(available, "Exact released init history is required");
  const scratch = mkdtempSync(path.join(realpathSync(tmpdir()), "template-released-init-"));
  t.after(() => rmSync(scratch, { recursive: true }));
  const env = { ...process.env, GIT_INDEX_FILE: path.join(scratch, "index") };
  git(["read-tree", `${releasedCommit}:plugin`], env);
  git(["checkout-index", "--all", `--prefix=${scratch.replaceAll("\\", "/")}/plugin/`], env);
  const source = path.join(scratch, "source"), root = path.join(scratch, "checkout");
  mkdirSync(root);
  const templates = { "CLAUDE.runbook.md": "Runbook {{runbook_version}}\n", "agents/dev.md": "---\nname: {{ws.agent}}\n---\nStub\n" };
  for (const role of ["pm", "feature-scout", "doc-auditor", "plan-verifier", "qa-verifier", "impl-verifier"]) templates[`agents/${role}.md`] = `---\nname: ${role}\ndescription: Fixture\n---\nStub\n`;
  for (const name of ["plans/README.md", "plans/template.md", "plans/verification-paths.md", "agents/README.md"]) templates[`docs/${name}`] = "Document\n";
  for (const [name, body] of Object.entries(templates)) {
    const file = path.join(source, "en", name); mkdirSync(path.dirname(file), { recursive: true }); writeFileSync(file, body);
  }
  writeFileSync(path.join(root, "harness.json"), JSON.stringify({ version: 1, project: { owner: "o", repo: "r", branch: "main" }, workspaces: [{ id: "app", agent: "dev", path: ".", verify: ["npm test"] }] }));
  writeFileSync(path.join(root, "CLAUDE.md"), "Preserve owner instructions\n");
  const childEnv = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^(HARNESS_|GIT_|NODE_OPTIONS$)/.test(key)));
  for (const state of ["ready", "pending"]) {
    writeFileSync(path.join(root, "harness.lock.json"), JSON.stringify({ version: 2, files: {}, clients: { claude: { state } } }));
    const before = Object.fromEntries(readdirSync(root).map(name => [name, readFileSync(path.join(root, name), "utf8")]));
    const result = spawnSync(process.execPath, [path.join(scratch, "plugin/bin/harness-init.mjs"), "--root", root, "--server", "https://fixture.invalid"], {
      encoding: "utf8", windowsHide: true, timeout: 15000, env: { ...childEnv, HARNESS_TEMPLATES_DIR: source, HARNESS_PLAN: "max" },
    });
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.match(result.stdout + result.stderr, /expected version 1/);
    assert.deepEqual(Object.fromEntries(readdirSync(root).map(name => [name, readFileSync(path.join(root, name), "utf8")])), before);
  }
  t.diagnostic(`Verified released init ${releasedCommit}; this is not an assertion about every older client version.`);
});

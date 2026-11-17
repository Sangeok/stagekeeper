import assert from "node:assert/strict";
import { it } from "node:test";
import { mkdtempSync, realpathSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { readTemplateTarget, requireTemplateToolsPlatform, templateCommandArguments, templateToolFailure, TemplateToolsPlatformError } from "./template-target";

const TOOLS = ["publish-templates", "activate-templates", "bootstrap-template-releases"];
const SUPPORTED = /Run them from WSL, macOS or Linux\./;

it("deployment commands validate help and arguments without connecting or exposing environment values", () => {
  for (const script of TOOLS) {
    const invoke = (args: string[]) => spawnSync(process.execPath, ["--import", "tsx", `scripts/templates/${script}.ts`, ...args], { encoding: "utf8", env: { ...process.env, DATABASE_URL: "secret-must-not-be-used" } });
    const help = invoke(["--help"]);
    assert.equal(help.status, 0, help.stderr);
    assert.match(help.stdout, /Usage:/);
    const rejected = invoke(["--unknown", "secret-must-not-be-printed"]);
    assert.notEqual(rejected.status, 0);
    assert.doesNotMatch(rejected.stdout + rejected.stderr, /secret-must-not/);
  }
});

it("refuses Windows before reading a profile and prints only that refusal in place of the private failure", () => {
  assert.throws(() => requireTemplateToolsPlatform("win32"), TemplateToolsPlatformError);
  for (const platform of ["linux", "darwin"] as const) assert.doesNotThrow(() => requireTemplateToolsPlatform(platform));
  assert.throws(() => readTemplateTarget(join(tmpdir(), "no-such-template-profiles.json"), "test", "win32"), error => error instanceof TemplateToolsPlatformError && SUPPORTED.test(error.message));
  assert.match(templateToolFailure(new TemplateToolsPlatformError("Run them from WSL, macOS or Linux."), "private failure"), SUPPORTED);
  assert.equal(templateToolFailure(new Error("postgresql://user:secret@host/db"), "private failure"), "private failure");
});

it("the deployment commands name the supported systems on Windows", { skip: process.platform !== "win32" ? "needs a real Windows process" : false }, () => {
  for (const script of TOOLS) {
    const run = spawnSync(process.execPath, ["--import", "tsx", `scripts/templates/${script}.ts`, "--profile-file", join(tmpdir(), "no-such-template-profiles.json"), "--environment", "test"], { encoding: "utf8" });
    assert.equal(run.status, 1);
    assert.match(run.stderr, SUPPORTED);
  }
});

it("profile selection requires an approved private target and refuses URL identity drift before connection", { skip: process.platform === "win32" ? "Windows does not report POSIX file modes, so the tools refuse to run there" : false }, () => {
  const root = mkdtempSync(join(realpathSync(tmpdir()), "template-target-test-"));
  const file = join(root, "profiles.json");
  const profile = { connectionString: "postgresql://postgres@127.0.0.1:55473/stagekeeper_test_target", hostname: "127.0.0.1", port: 55473, database: "stagekeeper_test_target", schema: "public" };
  try {
    writeFileSync(file, JSON.stringify({ test: profile }), { mode: 0o600 });
    const target = readTemplateTarget(file, "test");
    assert.equal(target.environment, "test");
    assert.match(target.identityHash, /^[a-f0-9]{64}$/);
    assert.throws(() => readTemplateTarget(file, "staging"));
    writeFileSync(file, JSON.stringify({ test: { ...profile, database: "different" } }));
    assert.throws(() => readTemplateTarget(file, "test"));
    writeFileSync(file, JSON.stringify({ test: { ...profile, connectionString: profile.connectionString + "?options=-csearch_path=other" } }));
    assert.throws(() => readTemplateTarget(file, "test"));
    for (const query of ["host=another-host", "port=5433", "database=other", "sslmode=require&sslmode=disable"]) {
      writeFileSync(file, JSON.stringify({ test: { ...profile, connectionString: `${profile.connectionString}?${query}` } }));
      assert.throws(() => readTemplateTarget(file, "test"));
    }
    assert.throws(() => templateCommandArguments(["--x", "one", "--x", "two"], ["--x"]));
  } finally { rmSync(root, { recursive: true, force: true }); }
});

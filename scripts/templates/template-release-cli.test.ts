import assert from "node:assert/strict";
import { it } from "node:test";
import { mkdtempSync, realpathSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { readTemplateTarget, templateCommandArguments } from "./template-target";

it("deployment commands validate help and arguments without connecting or exposing environment values", () => {
  for (const script of ["publish-templates", "activate-templates", "bootstrap-template-releases"]) {
    const invoke = (args: string[]) => spawnSync(process.execPath, ["--import", "tsx", `scripts/templates/${script}.ts`, ...args], { encoding: "utf8", env: { ...process.env, DATABASE_URL: "secret-must-not-be-used" } });
    const help = invoke(["--help"]);
    assert.equal(help.status, 0, help.stderr);
    assert.match(help.stdout, /Usage:/);
    const rejected = invoke(["--unknown", "secret-must-not-be-printed"]);
    assert.notEqual(rejected.status, 0);
    assert.doesNotMatch(rejected.stdout + rejected.stderr, /secret-must-not/);
  }
});

it("profile selection requires an approved private target and refuses URL identity drift before connection", () => {
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

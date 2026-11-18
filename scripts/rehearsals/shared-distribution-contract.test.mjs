import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, cpSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { it } from "node:test";
import { acceptanceClientEnvironment, distributionDigest, nativeBundleCommand, requireAcceptanceCi,
  selectedCodexCache, verifyInstalledBundle } from "./shared-distribution-contract.mjs";
import { distributionArguments } from "./rehearse-shared-distribution.mjs";

function fixture(t, platform) {
  const root = mkdtempSync(path.join(realpathSync.native(tmpdir()), "shared-installed-contract-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const bundle = path.join(root, "bundle"), installed = path.join(root, "profile/plugins/cache/harness/0.6.16");
  const runtime = platform === "darwin" ? "runtime/macos/node/bin/node" : "runtime/windows/node/node.exe";
  const files = { ".codex-plugin/plugin.json": '{"version":"0.6.16"}\n', "lib/example.mjs": 'export const contract = "한글\\r\\n";\r\n', [runtime]: "runtime-fixture" };
  const rows = [];
  for (const name of Object.keys(files).sort()) {
    const file = path.join(bundle, name); mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, files[name]); chmodSync(file, name === runtime ? 0o755 : 0o644);
    rows.push(platform === "darwin" ? [name, distributionDigest(files[name]), lstatSync(file).mode & 0o777] : [name, distributionDigest(files[name])]);
  }
  const manifestFile = platform === "darwin" ? "macos-package.json" : "windows-package.json";
  const commit = "a".repeat(40);
  writeFileSync(path.join(bundle, manifestFile), JSON.stringify({ format: `stagekeeper-${platform === "darwin" ? "macos" : "windows"}-plugin-v1`,
    sourceRevision: commit, inventory: rows, files: rows.length, packageSha256: distributionDigest(JSON.stringify(rows)),
    runtimeSha256: distributionDigest(files[runtime]), verifier: { checksum: "b".repeat(64) } }));
  cpSync(bundle, installed, { recursive: true });
  return { root, bundle, installed, commit, platform, manifestFile, runtime };
}

for (const platform of ["darwin", "win32"]) {
  it(`accepts complete installed bytes and provenance for ${platform}`, t => {
    const f = fixture(t, platform);
    const actual = verifyInstalledBundle(f);
    assert.equal(actual.pluginVersion, "0.6.16"); assert.equal(actual.pluginCommit, f.commit);
    assert.deepEqual(actual.libFiles, ["lib/example.mjs"]);
    assert.equal(actual.files, 3);
  });
  for (const change of ["changed", "missing", "extra", "forged-manifest"]) {
    it(`refuses ${change} in an installed ${platform} cache`, t => {
      const f = fixture(t, platform), moduleFile = path.join(f.installed, "lib/example.mjs");
      if (change === "changed") writeFileSync(moduleFile, "different");
      if (change === "missing") rmSync(moduleFile);
      if (change === "extra") writeFileSync(path.join(f.installed, "extra.mjs"), "unexpected");
      if (change === "forged-manifest") {
        const manifest = JSON.parse(readFileSync(path.join(f.installed, f.manifestFile), "utf8"));
        manifest.sourceRevision = "c".repeat(40);
        writeFileSync(path.join(f.installed, f.manifestFile), JSON.stringify(manifest));
      }
      assert.throws(() => verifyInstalledBundle(f));
    });
  }
}

it("refuses lost macOS executable permissions", { skip: process.platform === "win32" ? "POSIX executable bits require a POSIX host" : false }, t => {
  const f = fixture(t, "darwin");
  chmodSync(path.join(f.installed, f.runtime), 0o644);
  assert.throws(() => verifyInstalledBundle(f), /Installed payload differs/);
});

it("requires the CLI-selected version, enabled registration and an owned profile", t => {
  const f = fixture(t, "darwin"), profile = path.join(f.root, "profile");
  const added = { pluginId: "harness@acceptance", version: "0.6.16", installedPath: f.installed };
  const listing = { installed: [{ pluginId: added.pluginId, version: added.version, installed: true, enabled: true }] };
  const input = { added, listing, pluginId: added.pluginId, profile };
  assert.equal(selectedCodexCache(input), realpathSync.native(f.installed));
  assert.throws(() => selectedCodexCache({ ...input, listing: { installed: [{ ...listing.installed[0], enabled: false }] } }));
  assert.throws(() => selectedCodexCache({ ...input, listing: { installed: [{ ...listing.installed[0], version: "0.6.15" }] } }));
  assert.throws(() => selectedCodexCache({ ...input, added: { ...added, installedPath: f.bundle } }), /owned profile/);
});

it("keeps client credentials and development Node hooks out of the consumer environment", () => {
  const env = acceptanceClientEnvironment({ env: { HOME: "/runner", PATH: "/development/node/bin", OPENAI_API_KEY: "private", GH_TOKEN: "private", HARNESS_TOKEN: "private", NODE_OPTIONS: "--import tsx", CODEX_HOME: "/personal" },
    cliDirectory: "/owned/codex/bin", profile: "/owned/profile", platform: "darwin" });
  assert.equal(env.HOME, "/runner"); assert.equal(env.CODEX_HOME, "/owned/profile");
  for (const key of ["OPENAI_API_KEY", "GH_TOKEN", "HARNESS_TOKEN", "NODE_OPTIONS"]) assert.equal(Object.hasOwn(env, key), false);
  assert.equal(env.PATH.includes("/development"), false);
});

it("rejects local execution, unsupported hosts and incomplete path arguments before acceptance", () => {
  const env = { CI: "true", GITHUB_ACTIONS: "true", GITHUB_REPOSITORY: "Sangeok/stagekeeper", GITHUB_RUN_ID: "1", GITHUB_RUN_ATTEMPT: "1", RUNNER_TEMP: path.resolve("fixture") };
  requireAcceptanceCi(env, "win32", "x64");
  assert.throws(() => requireAcceptanceCi({ ...env, GITHUB_ACTIONS: "false" }, "darwin", "arm64"));
  assert.throws(() => requireAcceptanceCi(env, "linux", "x64"));
  assert.throws(() => distributionArguments(["--runtime", "relative"]));
  assert.throws(() => distributionArguments([]));
  const args = ["--runtime", "--templates", "--previous", "--evidence"].flatMap(name => [name, path.resolve(name.slice(2))]);
  assert.equal(distributionArguments(args).runtime, path.resolve("runtime"));
  assert.throws(() => distributionArguments([...args, "--run-models", "yes"]));
});

it("selects installed native launchers without a global Node fallback", () => {
  const win = nativeBundleCommand(path.resolve("bundle"), "init", ["--client", "codex"], "win32");
  assert.equal(win.file, "powershell.exe"); assert.ok(win.args.includes("-File"));
  const mac = nativeBundleCommand("/bundle", "session", ["--check"], "darwin");
  assert.deepEqual(mac, { file: "/bundle/bin/harness", args: ["session", "--check"] });
  assert.throws(() => nativeBundleCommand("/bundle", "dispatch-anything", [], "darwin"));
});

function acceptanceInputsScript() {
  const workflow = readFileSync(new URL("../../.github/workflows/shared-distribution-acceptance.yml", import.meta.url), "utf8").split(/\r?\n/);
  const step = workflow.findIndex(line => line.trim() === "- name: Check shared acceptance inputs");
  const run = workflow.findIndex((line, index) => index > step && /^\s+run: \|\s*$/.test(line));
  assert.ok(step !== -1 && run !== -1);
  const indent = workflow[run].search(/\S/);
  const body = [];
  for (const line of workflow.slice(run + 1)) {
    if (line.trim() && line.search(/\S/) <= indent) break;
    body.push(line);
  }
  const margin = Math.min(...body.filter(line => line.trim()).map(line => line.search(/\S/)));
  return body.map(line => line.slice(margin)).join("\n");
}

it("fails the acceptance inputs check outside pull requests when template access is unavailable", t => {
  const script = acceptanceInputsScript();
  const root = mkdtempSync(path.join(realpathSync.native(tmpdir()), "shared-acceptance-inputs-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const check = (name, env) => {
    const output = path.join(root, `${name}.out`);
    writeFileSync(output, "");
    const result = spawnSync("bash", ["-c", script], { encoding: "utf8", env: { ...process.env, GITHUB_OUTPUT: output, ...env } });
    return { error: result.error, status: result.status, output: readFileSync(output, "utf8").trim() };
  };
  const ready = check("ready", { EVENT_NAME: "push", TRUSTED_HEAD: "true", TEMPLATES_TOKEN: "present" });
  if (ready.error?.code === "ENOENT") return t.skip("bash is not available");
  assert.deepEqual(ready, { error: undefined, status: 0, output: "ready=true" });
  for (const event of ["push", "workflow_dispatch"]) {
    assert.deepEqual(check(event, { EVENT_NAME: event, TRUSTED_HEAD: "true", TEMPLATES_TOKEN: "" }), { error: undefined, status: 1, output: "" }, event);
  }
  assert.deepEqual(check("fork", { EVENT_NAME: "pull_request", TRUSTED_HEAD: "false", TEMPLATES_TOKEN: "" }), { error: undefined, status: 0, output: "ready=false" });
  assert.deepEqual(check("same-repo", { EVENT_NAME: "pull_request", TRUSTED_HEAD: "true", TEMPLATES_TOKEN: "" }), { error: undefined, status: 0, output: "ready=false" });
});

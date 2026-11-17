import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { lstatSync, readFileSync, readdirSync, realpathSync } from "node:fs";
import path from "node:path";

export const ACCEPTANCE_CODEX_VERSION = "0.167.1";
export const ACCEPTANCE_CODEX_ARCHIVES = Object.freeze({
  "darwin-arm64": { target: "aarch64-apple-darwin", bytes: 166615534, sha256: "5bcbc5866cbca19f9299f7884e9b39b9ccb5469969c170b1f2d2cd6fc4b1ee72" },
  "darwin-x64": { target: "x86_64-apple-darwin", bytes: 180452942, sha256: "ade991ce7fef5b4f4af884c154b9455d493cd0caf13789fc3ff9f842897b55d3" },
  "win32-x64": { target: "x86_64-pc-windows-msvc", bytes: 201602950, sha256: "a327ba32f46e39079486ffa29e160e9da9ab2b2f73744d6101509729c26c1c1b" },
});

export const distributionDigest = bytes => createHash("sha256").update(bytes).digest("hex");

export function requireAcceptanceCi(env, platform = process.platform, architecture = process.arch) {
  assert.equal(env.GITHUB_ACTIONS, "true", "Run installation acceptance on GitHub Actions only");
  assert.equal(env.CI, "true", "CI is required");
  assert.equal(env.GITHUB_REPOSITORY, "Sangeok/stagekeeper", "Unexpected acceptance repository");
  assert.match(env.GITHUB_RUN_ID ?? "", /^[1-9]\d*$/);
  assert.match(env.GITHUB_RUN_ATTEMPT ?? "", /^[1-9]\d*$/);
  assert.ok(ACCEPTANCE_CODEX_ARCHIVES[`${platform}-${architecture}`], "Unsupported acceptance platform");
  assert.ok(path.isAbsolute(env.RUNNER_TEMP ?? ""), "An owned runner directory is required");
}

export function acceptanceClientEnvironment({ env, cliDirectory, profile, gitDirectory, platform = process.platform }) {
  const allowed = new Set(["HOME", "USERPROFILE", "USER", "LOGNAME", "SystemRoot", "SYSTEMROOT", "WINDIR", "COMSPEC", "ComSpec", "PATHEXT", "TEMP", "TMP", "TMPDIR", "LANG"]);
  const result = Object.fromEntries(Object.entries(env).filter(([key]) => allowed.has(key)));
  const system = platform === "win32" ? env.SystemRoot ?? env.SYSTEMROOT ?? "C:\\Windows" : null;
  result.PATH = platform === "win32"
    ? [cliDirectory, gitDirectory, path.win32.join(system, "System32"), system, path.win32.join(system, "System32/WindowsPowerShell/v1.0")].filter(Boolean).join(";")
    : [cliDirectory, "/usr/bin", "/bin", "/usr/sbin", "/sbin"].join(":");
  result.CODEX_HOME = profile;
  result.CI = "true";
  result.DISABLE_AUTOUPDATER = "1";
  return result;
}

export function nativeBundleCommand(bundle, task, args, platform = process.platform) {
  assert.ok(["init", "codex", "session", "watch", "background", "template-guard"].includes(task), "Unexpected helper task");
  if (platform === "win32") return { file: "powershell.exe", args: ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", path.win32.join(bundle, "bin/harness.ps1"), task, ...args] };
  assert.equal(platform, "darwin");
  return { file: path.posix.join(bundle, "bin/harness"), args: [task, ...args] };
}

export function packageInventory(root, platform, excluded = new Set()) {
  const rows = [];
  function visit(directory, relative = "") {
    const directoryStat = lstatSync(directory);
    assert.ok(directoryStat.isDirectory() && !directoryStat.isSymbolicLink(), "Package directory alias refused");
    for (const name of readdirSync(directory).sort()) {
      const file = path.join(directory, name), local = relative ? relative + "/" + name : name, stat = lstatSync(file);
      assert.equal(stat.isSymbolicLink(), false, "Package alias refused");
      if (stat.isDirectory()) visit(file, local);
      else {
        assert.ok(stat.isFile() && stat.nlink === 1, "Package file type refused");
        if (excluded.has(local)) continue;
        const row = [local, distributionDigest(readFileSync(file))];
        if (platform === "darwin") row.push(stat.mode & 0o777);
        rows.push(row);
      }
    }
  }
  visit(root);
  return rows;
}

export function verifyInstalledBundle({ bundle, installed, commit, platform = process.platform }) {
  assert.ok(["win32", "darwin"].includes(platform));
  assert.match(commit, /^[a-f0-9]{40}$/);
  const file = platform === "darwin" ? "macos-package.json" : "windows-package.json";
  const manifest = JSON.parse(readFileSync(path.join(bundle, file), "utf8"));
  assert.equal(manifest.format, platform === "darwin" ? "stagekeeper-macos-plugin-v1" : "stagekeeper-windows-plugin-v1");
  assert.equal(manifest.sourceRevision, commit);
  assert.match(manifest.verifier?.checksum ?? "", /^[a-f0-9]{64}$/);
  const excluded = new Set([file]);
  const expected = packageInventory(bundle, platform, excluded);
  assert.deepEqual(expected, manifest.inventory, "Produced package inventory differs");
  assert.equal(manifest.files, expected.length);
  assert.equal(distributionDigest(JSON.stringify(expected)), manifest.packageSha256);
  assert.deepEqual(JSON.parse(readFileSync(path.join(installed, file), "utf8")), manifest, "Installed manifest differs");
  const actual = packageInventory(installed, platform, excluded);
  assert.deepEqual(actual, expected, "Installed payload differs");
  const runtime = platform === "darwin" ? "runtime/macos/node/bin/node" : "runtime/windows/node/node.exe";
  assert.equal(distributionDigest(readFileSync(path.join(installed, runtime))), manifest.runtimeSha256);
  const plugin = JSON.parse(readFileSync(path.join(installed, ".codex-plugin/plugin.json"), "utf8"));
  return { pluginCommit: commit, pluginVersion: plugin.version, packageSha256: manifest.packageSha256,
    runtimeSha256: manifest.runtimeSha256, verifierSha256: manifest.verifier.checksum, files: actual.length,
    libFiles: actual.filter(([file]) => file.startsWith("lib/")).map(([file]) => file) };
}

export function selectedCodexCache({ added, listing, pluginId, profile }) {
  assert.equal(added.pluginId, pluginId);
  assert.match(added.version, /^\d+\.\d+\.\d+$/);
  assert.ok(path.isAbsolute(added.installedPath ?? ""));
  const selected = listing.installed?.filter(entry => entry.pluginId === pluginId);
  assert.equal(selected?.length, 1, "Expected exactly one installed plugin");
  assert.equal(selected[0].installed, true);
  assert.equal(selected[0].enabled, true);
  assert.equal(selected[0].version, added.version);
  const cache = realpathSync.native(added.installedPath), root = realpathSync.native(profile);
  const relative = path.relative(root, cache);
  assert.ok(relative && relative !== ".." && !relative.startsWith(".." + path.sep) && !path.isAbsolute(relative), "Installed plugin left its owned profile");
  return cache;
}

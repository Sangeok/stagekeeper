import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, linkSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, truncateSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { it } from "node:test";
import { verifyWindowsRuntimeCache, windowsRuntimeCacheKey } from "./windows-role-runtime-cache.mjs";

const digest = bytes => createHash("sha256").update(bytes).digest("hex");
const builder = new URL("./build-windows-role-node.ps1", import.meta.url);
const cli = fileURLToPath(new URL("./windows-role-runtime-cache.mjs", import.meta.url));

function fixture(t) {
  const root = mkdtempSync(path.join(tmpdir(), "stagekeeper-runtime-cache-test-"));
  t.after(() => {
    assert.equal(path.dirname(root), path.resolve(tmpdir()));
    assert.ok(path.basename(root).startsWith("stagekeeper-runtime-cache-test-"));
    rmSync(root, { recursive: true, force: true });
  });
  const directory = path.join(root, "runtime");
  mkdirSync(path.join(directory, "npm/bin"), { recursive: true });
  // Verification must not execute this deliberately non-executable fixture.
  writeFileSync(path.join(directory, "node.exe"), "THIS_IS_NOT_AN_EXECUTABLE");
  writeFileSync(path.join(directory, "npm/bin/npm-cli.js"), "throw new Error('must not execute cached npm');");
  writeFileSync(path.join(directory, "LICENSE"), "fixture license");
  const manifest = {
    format: "stagekeeper-windows-node-v1", version: "22.23.3", architecture: "x64",
    buildArguments: ["release", "x64", "openssl-no-asm"], buildScriptSha256: digest(readFileSync(builder, "utf8").replace(/\r\n/g, "\n")),
    source: "https://nodejs.org/dist/v22.23.3/node-v22.23.3.tar.gz",
    sourceSha256: "9436c81b284889303d39f5b8bd629bf19e790c665ccb94b4994aa87220d9799a",
    pipeBackport: "https://github.com/libuv/libuv/pull/5181", pipeSourceSha256: "a".repeat(64),
    executableSha256: digest(readFileSync(path.join(directory, "node.exe"))), packageSha256: "",
  };
  function save() { writeFileSync(path.join(directory, "provenance.json"), JSON.stringify(manifest)); }
  function rehash() {
    const rows = [];
    function visit(current, relative = "") {
      for (const name of readdirSync(current).sort()) {
        const file = path.join(current, name), rel = path.posix.join(relative, name);
        if (name === "provenance.json" && !relative) continue;
        if (name === "npm" || name === "bin") visit(file, rel);
        else rows.push([rel, digest(readFileSync(file))]);
      }
    }
    visit(directory); manifest.packageSha256 = digest(JSON.stringify(rows)); save();
  }
  rehash();
  return { root, directory, manifest, save, rehash };
}

it("verifies a prepared package with runner Node without executing cached files", t => {
  const { directory, manifest } = fixture(t);
  const result = verifyWindowsRuntimeCache(directory);
  assert.equal(result.files, 3);
  assert.equal(result.executableSha256, manifest.executableSha256);
  assert.match(result.key, /^windows-role-node-runtime-v2-windows-2022-x64-[a-f0-9]{64}$/);
  const output = execFileSync(process.execPath, [cli, "verify", "--runtime", directory], { encoding: "utf8" });
  assert.equal(JSON.parse(output).packageSha256, manifest.packageSha256);
});

it("invalidates for recipe and verification changes while app changes keep the runtime identity", t => {
  const { root, directory } = fixture(t);
  const checkout = path.join(root, "checkout");
  for (const folder of ["scripts", "src", "plugin/runtime/windows"]) mkdirSync(path.join(checkout, folder), { recursive: true });
  for (const name of ["scripts/windows-role-runtime-cache.mjs", "scripts/build-windows-role-node.ps1",
    "plugin/runtime/role-commands.mjs", "plugin/runtime/windows/RoleProcess.cs", "plugin/runtime/windows/role-process.ps1"]) {
    copyFileSync(new URL(`../${name}`, import.meta.url), path.join(checkout, name));
  }
  const copiedCli = path.join(checkout, "scripts/windows-role-runtime-cache.mjs");
  const key = () => execFileSync(process.execPath, [copiedCli, "key"], { encoding: "utf8" }).trim();
  const initial = key();
  assert.equal(initial, windowsRuntimeCacheKey());
  for (const script of [copiedCli, path.join(checkout, "scripts/build-windows-role-node.ps1")]) {
    writeFileSync(script, readFileSync(script, "utf8").replace(/\r\n/g, "\n").replace(/\n/g, "\r\n"));
  }
  assert.equal(key(), initial, "checkout line endings must not invalidate the runtime");
  writeFileSync(path.join(checkout, "src/page.tsx"), "export default function Page() { return null; }");
  assert.equal(key(), initial);
  const copiedBuilder = path.join(checkout, "scripts/build-windows-role-node.ps1");
  writeFileSync(copiedBuilder, readFileSync(copiedBuilder, "utf8") + "\n# changed build recipe\n");
  const changedRecipe = key();
  assert.notEqual(changedRecipe, initial);
  const oldRuntime = spawnSync(process.execPath, [copiedCli, "verify", "--runtime", directory], { encoding: "utf8" });
  assert.notEqual(oldRuntime.status, 0);
  assert.match(oldRuntime.stderr, /build recipe differs/);
  writeFileSync(copiedCli, readFileSync(copiedCli, "utf8") + "\n// changed cache contract\n");
  assert.notEqual(key(), changedRecipe);
});

for (const [field, value] of [
  ["buildScriptSha256", "0".repeat(64)], ["version", "22.0.0"], ["architecture", "arm64"],
  ["sourceSha256", "0".repeat(64)], ["source", "https://example.com/node.tar.gz"],
  ["buildArguments", ["release", "x64"]], ["pipeBackport", "https://example.com/patch"], ["pipeSourceSha256", "invalid"],
]) {
  it(`refuses incompatible runtime provenance: ${field}`, t => {
    const { directory, manifest, save } = fixture(t);
    manifest[field] = value; save();
    assert.throws(() => verifyWindowsRuntimeCache(directory), /provenance differs|recipe differs/);
  });
}

for (const name of ["node.exe", "npm/bin/npm-cli.js", "unexpected-file.txt"]) {
  it(`refuses modified or additional runtime files: ${name}`, t => {
    const { directory } = fixture(t);
    writeFileSync(path.join(directory, name), "MODIFIED");
    assert.throws(() => verifyWindowsRuntimeCache(directory), /executable changed|package changed/);
  });
}

it("requires the executable, bundled npm entrypoint and license even with matching package hashes", t => {
  const { directory, rehash } = fixture(t);
  rmSync(path.join(directory, "LICENSE")); rehash();
  assert.throws(() => verifyWindowsRuntimeCache(directory), /file missing: LICENSE/);
});

it("refuses relative paths, directory aliases and file hardlinks", t => {
  const { root, directory } = fixture(t);
  assert.throws(() => verifyWindowsRuntimeCache("runtime"), /absolute/);
  const alias = path.join(root, "alias");
  symlinkSync(directory, alias, process.platform === "win32" ? "junction" : "dir");
  assert.throws(() => verifyWindowsRuntimeCache(alias), /alias refused/);
  linkSync(path.join(directory, "LICENSE"), path.join(root, "license-alias"));
  assert.throws(() => verifyWindowsRuntimeCache(directory), /alias refused/);
});

it("refuses an aliased npm directory before traversing it", t => {
  const { root, directory } = fixture(t);
  const outside = path.join(root, "outside"); mkdirSync(outside);
  rmSync(path.join(directory, "npm"), { recursive: true });
  symlinkSync(outside, path.join(directory, "npm"), process.platform === "win32" ? "junction" : "dir");
  assert.throws(() => verifyWindowsRuntimeCache(directory), /alias refused/);
});

it("bounds provenance reads, individual files and directory nesting", t => {
  const { directory, save } = fixture(t);
  writeFileSync(path.join(directory, "provenance.json"), " ".repeat(65537));
  assert.throws(() => verifyWindowsRuntimeCache(directory), /provenance size/);
  save();
  const executable = path.join(directory, "node.exe");
  truncateSync(executable, 128 * 1024 * 1024 + 1);
  assert.throws(() => verifyWindowsRuntimeCache(directory), /package size/);
  writeFileSync(executable, "THIS_IS_NOT_AN_EXECUTABLE");
  mkdirSync(path.join(directory, ...Array(34).fill("nested")), { recursive: true });
  assert.throws(() => verifyWindowsRuntimeCache(directory), /nesting unsupported/);
});

it("rejects unsupported CLI arguments without preparing or launching a runtime", () => {
  const result = spawnSync(process.execPath, [cli, "verify"], { encoding: "utf8" });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Expected key or verify/);
});

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { it } from "node:test";
import { fileURLToPath } from "node:url";

const LAUNCHER = fileURLToPath(new URL("./harness.ps1", import.meta.url));
const SYSTEM32 = path.join(process.env.SystemRoot ?? "C:\\Windows", "System32");
const POWERSHELL = path.join(SYSTEM32, "WindowsPowerShell", "v1.0", "powershell.exe");
const NODE_DIRECTORY = path.dirname(process.execPath);
const PACKAGING = /^Stagekeeper Windows package is missing or invalid\. Report a packaging failure; do not install Node or WSL as a workaround\./;
const skip = process.platform !== "win32" && "Windows only";
const ENTRY = `import { writeFileSync } from "node:fs";
writeFileSync(process.env.STAGEKEEPER_TEST_LAUNCH, JSON.stringify({ execPath: process.execPath, argv: process.argv.slice(2) }));
process.exitCode = 3;
`;

function plugin(t) {
  const root = mkdtempSync(path.join(tmpdir(), "stagekeeper-launcher-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const bin = path.join(root, "bin");
  mkdirSync(bin);
  copyFileSync(LAUNCHER, path.join(bin, "harness.ps1"));
  for (const name of ["harness-init.mjs", "harness-codex.mjs", "harness-session.mjs", "harness-watch.mjs", "harness-background.mjs"]) {
    writeFileSync(path.join(bin, name), ENTRY);
  }
  return { root, launcher: path.join(bin, "harness.ps1"), launch: path.join(root, "launch.json") };
}

function bundle(root, executable) {
  const runtime = path.join(root, "runtime", "windows", "node");
  mkdirSync(runtime, { recursive: true });
  const node = path.join(runtime, "node.exe");
  if (executable) copyFileSync(executable, node);
  else writeFileSync(node, "not node");
  writeFileSync(path.join(runtime, "provenance.json"), JSON.stringify({ format: "stagekeeper-windows-node-v1", version: "22.23.3", architecture: "x64",
    sourceSha256: "9436c81b284889303d39f5b8bd629bf19e790c665ccb94b4994aa87220d9799a",
    executableSha256: executable ? createHash("sha256").update(readFileSync(node)).digest("hex") : "0".repeat(64) }));
  return node;
}

function run(fixture, args, searchPath) {
  rmSync(fixture.launch, { force: true });
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => key.toLowerCase() !== "path"));
  const result = spawnSync(POWERSHELL, ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", fixture.launcher, ...args],
    { encoding: "utf8", windowsHide: true, env: { ...env, Path: searchPath, STAGEKEEPER_TEST_LAUNCH: fixture.launch } });
  return { status: result.status, stderr: result.stderr.trim(), launch: existsSync(fixture.launch) ? JSON.parse(readFileSync(fixture.launch, "utf8")) : null };
}

const withNode = `${NODE_DIRECTORY};${SYSTEM32}`;

it("runs Claude helpers from a source install on the Node.js in PATH", { skip }, t => {
  assert.equal(path.basename(process.execPath).toLowerCase(), "node.exe");
  const fixture = plugin(t);
  for (const [task, args] of [["watch", ["--root", "C:\\work\\repo", "--session", "s 1"]], ["session", ["--check", "--client", "claude"]],
    ["background", ["--status"]], ["init", ["--dry-run"]]]) {
    const result = run(fixture, [task, ...args], withNode);
    assert.equal(result.status, 3, result.stderr);
    assert.equal(result.launch.execPath.toLowerCase(), process.execPath.toLowerCase());
    assert.deepEqual(result.launch.argv, args);
  }
});

it("refuses Codex calls from a source install with the packaging failure", { skip }, t => {
  const fixture = plugin(t);
  for (const args of [["codex", "next"], ["init", "--client", "codex", "--dry-run"], ["background", "--start", "--client", "codex"]]) {
    const result = run(fixture, args, withNode);
    assert.equal(result.status, 1);
    assert.match(result.stderr, PACKAGING);
    assert.equal(result.launch, null);
  }
});

it("names the missing Node.js when a source install has none on PATH", { skip }, t => {
  const fixture = plugin(t);
  const result = run(fixture, ["watch", "--session", "s"], SYSTEM32);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /^Node\.js was not found on PATH\./);
  assert.equal(result.launch, null);
});

it("prefers a valid bundled runtime over the Node.js in PATH for both clients", { skip }, t => {
  const fixture = plugin(t);
  const bundled = bundle(fixture.root, process.execPath);
  for (const args of [["watch", "--session", "s"], ["codex", "next"], ["init", "--client", "codex", "--dry-run"]]) {
    const result = run(fixture, args, withNode);
    assert.equal(result.status, 3, result.stderr);
    assert.equal(result.launch.execPath.toLowerCase(), bundled.toLowerCase());
  }
});

it("refuses an invalid bundled runtime without falling back to PATH", { skip }, t => {
  const fixture = plugin(t);
  bundle(fixture.root, null);
  for (const args of [["watch", "--session", "s"], ["codex", "next"]]) {
    const result = run(fixture, args, withNode);
    assert.equal(result.status, 1);
    assert.match(result.stderr, PACKAGING);
    assert.equal(result.launch, null);
  }
});

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { chmodSync, linkSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { it } from "node:test";
import { installedMacosRuntime, MACOS_NODE_ARCHIVES } from "./macos-runtime.mjs";

const macos = { skip: process.platform !== "darwin" && "POSIX macOS executable modes required" };
const sha = value => createHash("sha256").update(value).digest("hex");
function fixture(t) {
  const base = mkdtempSync(path.join(realpathSync(tmpdir()), "macos-runtime-manifest-")), root = path.join(base, "runtime");
  const rows = [["LICENSE", "license", 0o644], ["bin/node", "node-fixture", 0o755], ["bin/npm", "npm-launcher", 0o755], ["bin/npx", "npx-launcher", 0o755],
    ["node.sha256", "node-checksum", 0o644], ["npm/bin/npm-cli.js", "npm-fixture", 0o644], ["sandbox-identity", "scanner-fixture", 0o755]];
  for (const [name, bytes, mode] of rows) { const file = path.join(root, name); mkdirSync(path.dirname(file), { recursive: true }); writeFileSync(file, bytes, { mode }); chmodSync(file, mode); }
  const manifest = { format: "stagekeeper-macos-node-v1", version: "22.23.3", architecture: process.arch, sourceSha256: MACOS_NODE_ARCHIVES[process.arch],
    executableSha256: sha("node-fixture"), scannerSha256: sha("scanner-fixture"), scannerSourceSha256: sha(readFileSync(new URL("./macos/sandbox-identity.c", import.meta.url))),
    packageSha256: sha(JSON.stringify(rows.map(([name, bytes, mode]) => [name, sha(bytes), mode]))) };
  const save = () => writeFileSync(path.join(root, "provenance.json"), JSON.stringify(manifest)); save();
  t.after(() => rmSync(base, { recursive: true }));
  return { base, root, manifest, rows, save };
}

it("validates a bounded macOS runtime inventory without executing its files", macos, t => {
  const f = fixture(t), result = installedMacosRuntime(f.root);
  assert.equal(result.directory, f.root); assert.equal(result.version, "22.23.3");
});

for (const field of ["format", "version", "architecture", "sourceSha256", "scannerSourceSha256"]) {
  it(`rejects incompatible macOS provenance: ${field}`, macos, t => {
    const f = fixture(t); f.manifest[field] = "wrong"; f.save();
    assert.throws(() => installedMacosRuntime(f.root), /provenance|package changed/);
  });
}

it("rejects missing required files even if the declared inventory was changed with them", macos, t => {
  const f = fixture(t); rmSync(path.join(f.root, "LICENSE"));
  f.manifest.packageSha256 = sha(JSON.stringify(f.rows.filter(([name]) => name !== "LICENSE").map(([name, bytes, mode]) => [name, sha(bytes), mode]))); f.save();
  assert.throws(() => installedMacosRuntime(f.root), /incomplete/);
});

it("rejects changed bytes, extra files and nonexecutable runtime entries", macos, t => {
  const changed = fixture(t); writeFileSync(path.join(changed.root, "bin/node"), "changed");
  assert.throws(() => installedMacosRuntime(changed.root), /package changed/);
  const extra = fixture(t); writeFileSync(path.join(extra.root, "unexpected"), "extra");
  assert.throws(() => installedMacosRuntime(extra.root), /package changed/);
  const mode = fixture(t); chmodSync(path.join(mode.root, "sandbox-identity"), 0o600);
  assert.throws(() => installedMacosRuntime(mode.root), /executable mode/);
});

it("refuses aliased, hard-linked and oversized provenance before consuming it", macos, t => {
  const f = fixture(t), file = path.join(f.root, "provenance.json"), outside = path.join(f.base, "outside.json");
  writeFileSync(outside, JSON.stringify(f.manifest)); rmSync(file); symlinkSync(outside, file);
  assert.throws(() => installedMacosRuntime(f.root), /provenance file/);
  rmSync(file); linkSync(outside, file);
  assert.throws(() => installedMacosRuntime(f.root), /provenance file/);
  rmSync(file); writeFileSync(file, " ".repeat(16385));
  assert.throws(() => installedMacosRuntime(f.root), /provenance file/);
  assert.deepEqual(JSON.parse(readFileSync(outside, "utf8")), f.manifest);
});

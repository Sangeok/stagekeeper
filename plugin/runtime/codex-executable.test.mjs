import assert from "node:assert/strict";
import { it } from "node:test";
import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { codexExecutable } from "./codex-thread.mjs";

function fixture(t) {
  const root = mkdtempSync(path.join(realpathSync(tmpdir()), "codex-launcher-test-"));
  t.after(() => { assert.equal(path.dirname(root), realpathSync(tmpdir())); return rm(root, { recursive: true }); });
  const custom = path.join(root, "custom"), npm = path.join(root, "npm installation");
  mkdirSync(custom); mkdirSync(path.join(npm, "node_modules/@openai/codex/bin"), { recursive: true });
  writeFileSync(path.join(custom, "codex.cmd"), '@ECHO OFF\nnode.exe "%~dp0codex-launcher.mjs" %*\n');
  writeFileSync(path.join(npm, "codex.cmd"), '@ECHO OFF\nnode "%~dp0node_modules\\@openai\\codex\\bin\\codex.js" %*\n');
  writeFileSync(path.join(npm, "node_modules/@openai/codex/package.json"), JSON.stringify({ name: "@openai/codex", bin: { codex: "bin/codex.js" } }));
  writeFileSync(path.join(npm, "node_modules/@openai/codex/bin/codex.js"), 'console.log("codex-cli 0.163.0");\n');
  return { root, custom, npm, entry: path.join(npm, "node_modules/@openai/codex/bin/codex.js") };
}

it("finds and identifies the working npm CLI after an unsupported Windows wrapper", t => {
  const f = fixture(t), cli = codexExecutable({ Path: `${f.custom};"${f.npm}"` }, "win32");
  assert.equal(cli.executable, process.execPath);
  assert.deepEqual(cli.prefix, [f.entry]);
  assert.equal(cli.version, "codex-cli 0.163.0");
  assert.equal(cli.source, path.join(f.npm, "codex.cmd"));
  assert.deepEqual(cli.skipped, [{ path: path.join(f.custom, "codex.cmd"), reason: "unsupported-wrapper" }]);
});

it("refuses an unknown wrapper without executing it or treating cwd as PATH", t => {
  const f = fixture(t);
  assert.throws(() => codexExecutable({ PATH: `;.;${f.custom}` }, "win32"), /No supported Codex CLI/);
});

it("validates package identity and a real CLI version before selecting an npm wrapper", t => {
  const f = fixture(t);
  writeFileSync(path.join(f.npm, "node_modules/@openai/codex/package.json"), JSON.stringify({ name: "other", bin: { codex: "bin/codex.js" } }));
  assert.throws(() => codexExecutable({ PATH: f.npm }, "win32"), /No supported Codex CLI/);
  writeFileSync(path.join(f.npm, "node_modules/@openai/codex/package.json"), JSON.stringify({ name: "@openai/codex", bin: { codex: "bin/codex.js" } }));
  writeFileSync(f.entry, 'console.log("not a Codex CLI");\n');
  assert.throws(() => codexExecutable({ PATH: f.npm }, "win32"), /No supported Codex CLI/);
});

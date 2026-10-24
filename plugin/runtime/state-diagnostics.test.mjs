import assert from "node:assert/strict";
import { it } from "node:test";
import path from "node:path";
import { mkdtempSync, realpathSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { readJson, readState, stateFiles, atomicWrite } from "./local-session.mjs";
import { stateDiagnostic, readStateDiagnostic } from "./state-diagnostics.mjs";

it("identifies malformed or missing state without exposing contents or paths or changing the files", t => {
  const root = mkdtempSync(path.join(realpathSync(tmpdir()), "harness-state-diagnostic-"));
  t.after(() => { assert.equal(path.dirname(root), realpathSync(tmpdir())); assert.ok(path.basename(root).startsWith("harness-state-diagnostic-")); rmSync(root, { recursive: true }); });
  const file = path.join(root, "watch.lock.json"), body = '{"token":"SECRET_CANARY",'; writeFileSync(file, body);
  assert.throws(() => readJson(file), error => {
    assert.equal(error.code, "corrupt-state"); assert.deepEqual(readStateDiagnostic(error), { phase: "read-json", target: "lock", errorKind: "SyntaxError", systemCode: null });
    assert.equal(JSON.stringify(error).includes("SECRET_CANARY"), false); assert.equal(JSON.stringify(error).includes(root), false); return true;
  });
  assert.equal(readFileSync(file, "utf8"), body);
  assert.throws(() => readJson(path.join(root, "watch.json")), error => error.diagnostic.systemCode === "ENOENT" && error.diagnostic.target === "policy");
  writeFileSync(file, "{}"); writeFileSync(path.join(root, "watch.json"), "{}");
  assert.throws(() => readState(stateFiles(root)), error => error.diagnostic.phase === "state-schema");
  const cyclic = {}; cyclic.self = cyclic;
  assert.throws(() => atomicWrite(file, cyclic), error => error.diagnostic.phase === "state-write" && error.code === "corrupt-state");
  assert.equal(readFileSync(file, "utf8"), "{}");
});

it("does not reflect arbitrary error names, codes, paths, or injected diagnostic fields", () => {
  const secret = "SECRET_CANARY", error = { name: secret, code: secret, message: secret, diagnostic: { phase: secret, target: secret } };
  assert.equal(JSON.stringify(stateDiagnostic(secret, secret, error)).includes(secret), false);
  assert.equal(JSON.stringify(readStateDiagnostic(error)).includes(secret), false);
});

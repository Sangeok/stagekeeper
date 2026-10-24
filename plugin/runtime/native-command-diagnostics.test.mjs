import assert from "node:assert/strict";
import { it } from "node:test";
import { nativeCommandFailure } from "./native-command-diagnostics.mjs";

it("keeps only fixed helper stages and numeric diagnostics when stderr contains extra output", () => {
  const secret = "SECRET_PATH_TOKEN_CANARY", stderr = `${secret}\n${JSON.stringify({ error: "native-helper-failed", stage: "validation-profile", hresult: -2146233088, nativeErrorCode: 5, message: secret })}\n`;
  const error = nativeCommandFailure("helper-exit", { terminal: { code: 1 }, stdout: secret, stderr, stderrBytes: Buffer.byteLength(stderr) });
  assert.equal(error.diagnostic.helperStage, "validation-profile"); assert.equal(error.diagnostic.hresult, -2146233088);
  assert.equal(error.diagnostic.nativeErrorCode, 5); assert.equal(error.diagnostic.exitCode, 1);
  assert.equal(error.diagnostic.stderrKind, "structured"); assert.match(error.message, /validation-profile; HRESULT -2146233088; Win32 5/);
  assert.equal(JSON.stringify(error).includes(secret), false); assert.equal(error.message.includes(secret), false);
});

it("distinguishes missing, invalid, and overflowing helper diagnostics without reflecting unknown fields", () => {
  const secret = "SECRET_CANARY", stderr = JSON.stringify({ error: "native-helper-failed", stage: secret, hresult: 1 });
  const missing = nativeCommandFailure("helper-exit", { terminal: { code: -1073741819 } });
  assert.equal(missing.diagnostic.stderrKind, "empty"); assert.equal(missing.diagnostic.exitCode, -1073741819);
  const invalid = nativeCommandFailure(secret, { terminal: { code: secret, terminalSignal: secret }, stderr, stderrBytes: stderr.length, systemCode: secret });
  assert.equal(invalid.diagnostic.stderrKind, "unrecognized"); assert.equal(invalid.diagnostic.helperStage, null);
  assert.equal(JSON.stringify(invalid).includes(secret), false); assert.equal(invalid.message.includes(secret), false);
  const overflow = nativeCommandFailure("helper-exit", { terminal: { terminalSignal: "SIGTERM" }, stderrBytes: 9000 });
  assert.equal(overflow.diagnostic.stderrKind, "overflow"); assert.equal(overflow.diagnostic.signal, "SIGTERM");
  assert.match(overflow.message, /ownership retained/);
});

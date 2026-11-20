import assert from "node:assert/strict";
import { it } from "node:test";
import fs, { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { stateFiles, WatchFailure, withGuard } from "./local-session.mjs";

const systemError = code => Object.assign(new Error(code), { code });

function guardFixture(t, platform) {
  const root = mkdtempSync(path.join(realpathSync.native(tmpdir()), "harness-local-session-"));
  const directory = path.join(root, "harness");
  mkdirSync(directory);
  const descriptor = Object.getOwnPropertyDescriptor(process, "platform");
  Object.defineProperty(process, "platform", { ...descriptor, value: platform });
  t.after(() => {
    Object.defineProperty(process, "platform", descriptor);
    t.mock.restoreAll(); syncBuiltinESMExports();
    rmSync(root, { recursive: true });
  });
  return stateFiles(directory);
}

function failFirst(t, name, codes) {
  const original = fs[name], pending = [...codes];
  const mocked = t.mock.method(fs, name, (...args) => {
    if (pending.length) throw systemError(pending.shift());
    return original(...args);
  });
  syncBuiltinESMExports();
  return mocked.mock;
}

it("retries a Windows EPERM from creating a guard that is still being removed and runs the action once", async t => {
  const files = guardFixture(t, "win32");
  const mkdir = failFirst(t, "mkdirSync", ["EPERM", "EACCES", "EBUSY"]);
  let runs = 0;

  const result = await withGuard(files, () => { runs++; return "done"; });

  assert.equal(result, "done");
  assert.equal(runs, 1);
  assert.equal(mkdir.callCount(), 4);
  assert.equal(existsSync(files.guard), false);
});

it("reports a Windows guard creation error that persists until the guard limit as corrupt state with its diagnostic", async t => {
  const files = guardFixture(t, "win32");
  const mkdir = failFirst(t, "mkdirSync", Array(100).fill("EPERM"));
  let clock = 0;
  t.mock.method(performance, "now", () => (clock += 1000));
  let runs = 0;

  await assert.rejects(withGuard(files, () => { runs++; }), error => {
    assert.ok(error instanceof WatchFailure);
    assert.equal(error.code, "corrupt-state");
    assert.deepEqual({ ...error.diagnostic }, { phase: "guard-create", target: "guard", errorKind: "Error", systemCode: "EPERM" });
    return true;
  });
  assert.equal(runs, 0);
  assert.ok(mkdir.callCount() > 1);
  assert.equal(existsSync(files.guard), false);
});

it("fails a guard creation EPERM outside Windows on the first attempt without running the action", async t => {
  const files = guardFixture(t, "linux");
  const mkdir = failFirst(t, "mkdirSync", ["EPERM"]);
  let runs = 0;

  await assert.rejects(withGuard(files, () => { runs++; }), error => error.code === "corrupt-state"
    && error.diagnostic.phase === "guard-create" && error.diagnostic.systemCode === "EPERM");
  assert.equal(runs, 0);
  assert.equal(mkdir.callCount(), 1);
});

it("retries Windows errors while removing its own guard and keeps the action result", async t => {
  const files = guardFixture(t, "win32");
  const unlink = failFirst(t, "unlinkSync", ["EPERM"]);
  const rmdir = failFirst(t, "rmdirSync", ["EBUSY", "ENOTEMPTY"]);

  const result = await withGuard(files, () => "kept");

  assert.equal(result, "kept");
  assert.equal(unlink.callCount(), 2);
  assert.equal(rmdir.callCount(), 3);
  assert.equal(existsSync(files.guard), false);
});

it("propagates a guard removal error outside Windows without retrying", async t => {
  const files = guardFixture(t, "linux");
  const rmdir = failFirst(t, "rmdirSync", ["EBUSY"]);

  await assert.rejects(withGuard(files, () => "lost"), error => error.code === "EBUSY");
  assert.equal(rmdir.callCount(), 1);
});

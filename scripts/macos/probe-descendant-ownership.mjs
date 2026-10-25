import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

if (process.platform !== "darwin") throw new Error("A real macOS kernel is required");
const output = process.argv[2];
if (!output || fs.existsSync(output)) throw new Error("A new evidence JSON path is required");
const parent = fs.realpathSync(os.tmpdir());
const root = fs.realpathSync(fs.mkdtempSync(path.join(parent, "stagekeeper-ownership-")));
const source = fileURLToPath(new URL("./probe-descendant-ownership.c", import.meta.url));
const binary = path.join(root, "ownership-probe");
const digest = file => createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const options = { encoding: "utf8", timeout: 60000, maxBuffer: 1024 * 1024 };
execFileSync("/usr/bin/xcrun", ["clang", "-std=c11", "-Wall", "-Wextra", "-Werror", source, "-o", binary], options);
const observations = JSON.parse(execFileSync(binary, [], options));
assert.equal(observations.ordinaryUser, true);
assert.deepEqual(observations.scenarios.map(item => item.scenario), ["root-exit", "group-kill"]);
for (const item of observations.scenarios) {
  for (const key of ["recursiveTrackingRejected", "rootTerminal", "outputEof", "rootChildSnapshotEmpty", "ownedDescendantsExited"]) assert.equal(item[key], true);
  assert.equal(item.descendantIdentityInEvent, false);
  assert.equal(item.directForks, 4);
  assert.equal(item.coalescedRootEvents, 1);
  assert.equal(item.detachedOrphansAlive, 4);
  assert.equal(item.knownIdentityExitEvents, 4);
}
const result = {
  schema: 1, platform: process.platform, arch: process.arch, release: os.release(), node: process.version,
  sourceSha256: digest(source), binarySha256: digest(binary),
  sdk: execFileSync("/usr/bin/xcrun", ["--show-sdk-version"], options).trim(),
  scope: "native API counterexamples; cooperative oracle for fixture cleanup only; no production backend or client authentication",
  observations, verdict: "BLOCKED_KQUEUE_AND_PID_SNAPSHOTS_NOT_OWNERSHIP", productionBackendEnabled: false,
};
fs.writeFileSync(output, JSON.stringify(result, null, 2) + "\n", { flag: "wx" });
assert.equal(path.dirname(root), parent);
assert.ok(path.basename(root).startsWith("stagekeeper-ownership-"));
fs.rmSync(root, { recursive: true });
console.log(JSON.stringify({ verdict: result.verdict, arch: result.arch, scenarios: 2, ownedDescendantsExited: true }));

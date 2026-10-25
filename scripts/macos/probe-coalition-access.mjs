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
const root = fs.realpathSync(fs.mkdtempSync(path.join(parent, "stagekeeper-coalition-")));
fs.chmodSync(root, 0o700);
const source = fileURLToPath(new URL("./probe-coalition-access.c", import.meta.url));
const binary = path.join(root, "coalition-probe");
const digest = file => createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const options = { encoding: "utf8", timeout: 30000, maxBuffer: 1024 * 1024 };
execFileSync("/usr/bin/xcrun", ["clang", "-std=c11", "-Wall", "-Wextra", "-Werror", source, "-o", binary], options);
const sdkRoot = execFileSync("/usr/bin/xcrun", ["--show-sdk-path"], options).trim();
const observations = JSON.parse(execFileSync(binary, [], options));
const result = {
  schema: 1, platform: process.platform, arch: process.arch, release: os.release(), node: process.version,
  sourceSha256: digest(source), driverSha256: digest(fileURLToPath(import.meta.url)), binarySha256: digest(binary),
  sdk: execFileSync("/usr/bin/xcrun", ["--show-sdk-version"], options).trim(),
  sdkHeaders: Object.fromEntries(["sys/coalition.h", "mach/coalition.h", "sys/proc_info_private.h", "spawn_private.h"].map(header => [header, fs.existsSync(path.join(sdkRoot, "usr/include", header))])),
  abiReference: "https://github.com/apple-oss-distributions/xnu/tree/f6217f891ac0bb64f3d375211650a4c1ff8ca1ea",
  scope: "ordinary-user coalition creation and explicit spawn access; existing membership queried only; no elevation, client credentials or production backend",
  observations, verdict: "UNCLASSIFIED", productionBackendEnabled: false,
};
fs.writeFileSync(output, JSON.stringify(result, null, 2) + "\n", { flag: "wx" });
for (const key of ["ordinaryUser", "symbolsResolved", "querySucceeded", "forkSetsidExecPreservedMembership", "ordinarySpawnSucceeded"]) assert.equal(observations[key], true);
assert.equal(observations.controlChildrenReaped, 2);
assert.equal(observations.existingCoalitionTerminationAttempted, false);
assert.equal(observations.liveCoalitionTerminationTested, false);
assert.deepEqual(observations.creation.map(item => item.type), ["resource", "jetsam"]);
assert.deepEqual(observations.spawn.map(item => item.type), ["resource", "jetsam"]);
for (const item of observations.creation) {
  assert.equal(item.result, -1);
  assert.equal(item.errno, os.constants.errno.EPERM);
  assert.equal(item.flags, item.type === "resource" ? 0 : 16);
  assert.equal(item.idAssigned, false);
  assert.equal(item.emptyOwnedCleanup, null);
}
for (const item of observations.spawn) {
  assert.equal(item.target, "current-membership");
  assert.equal(item.attributeResult, 0);
  assert.equal(item.spawnAttempted, true);
  assert.equal(item.spawnResult, os.constants.errno.EPERM);
  assert.equal(item.childReaped, false);
}
result.verdict = "BLOCKED_ORDINARY_USER_COALITION_CONTROL_DENIED";
fs.writeFileSync(output, JSON.stringify(result, null, 2) + "\n");
assert.equal(path.dirname(root), parent);
assert.ok(path.basename(root).startsWith("stagekeeper-coalition-"));
fs.rmSync(root, { recursive: true });
console.log(JSON.stringify({ verdict: result.verdict, arch: result.arch, creationDenials: 2, explicitSpawnDenials: 2, controlChildrenReaped: 2 }));

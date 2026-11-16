import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createRoleFiles } from "../../plugin/runtime/role-files.mjs";
import { createMacosCommands } from "../../plugin/runtime/macos-commands.mjs";
import { installedMacosRuntime } from "../../plugin/runtime/macos-runtime.mjs";
import { ROLE_COMMAND_MAX_TIMEOUT_MS } from "../../plugin/runtime/role-commands.mjs";

const args = process.argv.slice(2);
assert.deepEqual([args[0], args[2], args[4]], ["--root", "--runtime", "--evidence"]);
assert.equal(args.length, 6);
assert.equal(process.platform, "darwin");
for (const value of [args[1], args[3], args[5]]) assert.ok(path.isAbsolute(value));
const root = realpathSync(args[1]), runtime = installedMacosRuntime(args[3]), evidencePath = args[5];
const relativeEvidence = path.relative(root, evidencePath);
assert.ok(relativeEvidence.startsWith(".." + path.sep) || path.isAbsolute(relativeEvidence));
assert.equal(existsSync(evidencePath), false);
const digest = value => createHash("sha256").update(value).digest("hex");
const sourceFiles = ["package.json", "package-lock.json", "scripts/build.mjs", "prisma.config.ts", "prisma/schema.prisma", "next.config.mjs", "src/app/layout.tsx"];
const hashes = () => Object.fromEntries(sourceFiles.map(name => [name, digest(readFileSync(path.join(root, name)))]));
const sourceHashes = hashes(), buildId = path.join(root, ".next/BUILD_ID");
const originalBuildId = existsSync(buildId) ? readFileSync(buildId, "utf8") : null;
const scratch = mkdtempSync(path.join(realpathSync(tmpdir()), "harness-project-build-"));
const fileBroker = createRoleFiles({ ":root": "deny", [root]: "read", [scratch]: "write" }, "plan-verifier");
let broker, settled = false;
try {
  broker = await createMacosCommands({ root, scratch, agent: "plan-verifier", fileBroker, runtime });
  const started = performance.now();
  const result = await broker.call("role_command_exec", { command: "NEXT_TELEMETRY_DISABLED=1 npm run build", timeoutMs: ROLE_COMMAND_MAX_TIMEOUT_MS });
  const durationMs = Math.round(performance.now() - started);
  settled = result.quiescent === true;
  writeFileSync(evidencePath, JSON.stringify({ at: new Date().toISOString(), sourceHashes, runtimeSha256: runtime.executableSha256,
    databaseUrlProvided: false, roleNetworkAccess: false, modelTurns: 0, timeoutMs: ROLE_COMMAND_MAX_TIMEOUT_MS, durationMs, result }, null, 2) + "\n", { flag: "wx", mode: 0o600 });
  console.log(JSON.stringify({ build: result.status, timeoutMs: ROLE_COMMAND_MAX_TIMEOUT_MS, durationMs }));
  assert.equal(result.status, "exited");
  assert.equal(result.exitCode, 0, "Full project build must succeed without role network or DB credentials");
  assert.equal(result.quiescent, true); assert.equal(result.outputTruncated, false);
  assert.equal(result.snapshotWrites, "discarded"); assert.equal(result.originalRepositoryWrites, false);
  assert.match(result.stdout, /Route \(app\)/);
  assert.deepEqual(hashes(), sourceHashes);
  assert.equal(existsSync(buildId) ? readFileSync(buildId, "utf8") : null, originalBuildId);
  console.log(JSON.stringify({ result: "pass", files: result.files, snapshotHash: result.snapshotHash, network: false, originalWrites: false }));
} finally {
  await broker?.close();
  if (!broker || settled) rmSync(scratch, { recursive: true });
}

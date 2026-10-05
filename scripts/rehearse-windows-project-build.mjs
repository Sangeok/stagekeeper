import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRoleFiles } from "../plugin/runtime/role-files.mjs";
import { createRoleCommands, installedWindowsRuntime } from "../plugin/runtime/role-commands.mjs";

const digest = bytes => createHash("sha256").update(bytes).digest("hex");

// Dependencies are prepared with normal npm ci by the maintainer/CI before this
// test. No installs, credentials, environment copies or network grants happen
// in the role. Every build artifact stays in its disposable snapshot.
export async function rehearseWindowsProjectBuild({ root, runtimeDirectory }) {
  assert.equal(process.platform, "win32", "Native Windows is required");
  root = realpathSync(root);
  const runtime = installedWindowsRuntime(runtimeDirectory);
  for (const name of ["package.json", "package-lock.json", "prisma/schema.prisma", "node_modules/@prisma/engines/schema-engine-windows.exe"]) {
    assert.ok(existsSync(path.join(root, name)), `Normal npm ci must prepare ${name}`);
  }
  const sourceNames = ["package.json", "package-lock.json", "prisma.config.ts", "prisma/schema.prisma", "next.config.mjs",
    "scripts/build.mjs", "scripts/windows-role-readlink.cjs", "scripts/windows-role-spawn-diagnostics.cjs", "src/app/layout.tsx",
    "src/app/fonts/schibsted-grotesk-normal.ttf", "src/app/fonts/fragment-mono-regular.ttf"];
  const sources = () => Object.fromEntries(sourceNames.map(name => [name, digest(readFileSync(path.join(root, name)))]));
  const sourceHashes = sources();
  const originalBuildId = existsSync(path.join(root, ".next/BUILD_ID")) ? readFileSync(path.join(root, ".next/BUILD_ID"), "utf8") : null;
  const temporaryRoot = realpathSync(tmpdir());
  const scratch = await mkdtemp(path.join(temporaryRoot, "stagekeeper-project-build-acceptance-"));
  let broker;
  let settled = false;
  try {
    const files = createRoleFiles({ ":root": "deny", [root]: "read", [scratch]: "write" }, "plan-verifier");
    broker = await createRoleCommands({ root, scratch, agent: "plan-verifier", fileBroker: files, runtime });
    // Clearing the variables is explicit; the launcher also uses a fixed clean
    // environment. .next is excluded by the snapshot, so this is a fresh build.
    const result = await broker.call("role_command_exec", {
      command: 'set "DATABASE_URL=" && set "NEXT_TELEMETRY_DISABLED=1" && set "STAGEKEEPER_BUILD_DIAGNOSTICS=1" && npm run build',
      timeoutMs: 120000,
    });
    settled = result.quiescent === true;
    const evidence = {
      at: new Date().toISOString(), sourceHashes,
      runtimeSha256: runtime.executableSha256, runtimePackageSha256: runtime.packageSha256,
      dependencyPreparation: "normal npm ci before the role, including Prisma engine postinstall",
      databaseUrlProvided: false, roleNetworkAccess: false, modelTurns: 0,
      result,
    };
    // Print failures as well, so CI preserves the actual compiler diagnostics.
    console.log(JSON.stringify(evidence, null, 2));
    assert.equal(result.status, "exited");
    assert.equal(result.exitCode, 0, "Full project build must succeed with no role network or DB URL");
    assert.equal(result.quiescent, true);
    assert.equal(result.outputTruncated, false);
    assert.equal(result.snapshotWrites, "discarded");
    assert.equal(result.originalRepositoryWrites, false);
    assert.match(result.stdout, /Route \(app\)/);
    assert.deepEqual(sources(), sourceHashes);
    const buildIdAfter = existsSync(path.join(root, ".next/BUILD_ID")) ? readFileSync(path.join(root, ".next/BUILD_ID"), "utf8") : null;
    assert.equal(buildIdAfter, originalBuildId, "The build must not change original artifacts");
    return evidence;
  } finally {
    await broker?.close();
    // Unacknowledged executions retain scratch for explicit diagnosis/recovery.
    if (!broker || settled) {
      assert.equal(path.dirname(scratch), temporaryRoot);
      assert.ok(path.basename(scratch).startsWith("stagekeeper-project-build-acceptance-"));
      await rm(scratch, { recursive: true });
    }
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  assert.equal(args.length, 4, "Expected --root <prepared project> --runtime <verified Windows runtime>");
  assert.equal(args[0], "--root");
  assert.equal(args[2], "--runtime");
  await rehearseWindowsProjectBuild({ root: path.resolve(args[1]), runtimeDirectory: path.resolve(args[3]) });
}

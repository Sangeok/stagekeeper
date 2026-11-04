import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { execFile, execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { it } from "node:test";
import pg from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../../src/generated/prisma/client";
import { validateTestDatabase } from "../../../scripts/test-server-integration.mjs";
import { releaseRows } from "./template-release-support";

it("actual operator CLIs import, snapshot, bootstrap, inspect, activate and recover against an explicit isolated target", { timeout: 30000 }, async () => {
  const parentUrl = validateTestDatabase({ TEST_DATABASE_URL: process.env.TEST_DATABASE_URL });
  const database = `stagekeeper_test_template_cli_${randomUUID().replaceAll("-", "").slice(0, 12)}`;
  const url = new URL(parentUrl); url.pathname = `/${database}`;
  const admin = new pg.Client({ connectionString: parentUrl }); await admin.connect();
  const scratch = mkdtempSync(path.join(realpathSync(tmpdir()), "template-operator-test-"));
  let db: PrismaClient | undefined;
  let created = false;
  try {
    await admin.query(`CREATE DATABASE "${database}"`); created = true;
    const connection = new pg.Client({ connectionString: url.href }); await connection.connect();
    try {
      for (const name of readdirSync("prisma/migrations", { withFileTypes: true }).filter(row => row.isDirectory()).map(row => row.name).sort()) {
        await connection.query(readFileSync(path.join("prisma/migrations", name, "migration.sql"), "utf8"));
      }
    } finally { await connection.end(); }
    db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url.href }) });
    await db.template.createMany({ data: releaseRows() });
    const source = path.join(scratch, "source"); mkdirSync(source);
    for (const row of releaseRows()) {
      const file = path.join(source, row.lang, row.path); mkdirSync(path.dirname(file), { recursive: true }); writeFileSync(file, row.body);
    }
    const git = (...args: string[]) => execFileSync("git", ["-C", source, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
    git("init", "-q"); git("add", "."); git("-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "-qm", "Synthetic template corpus");
    git("remote", "add", "origin", "https://github.com/Sangeok/harness-templates.git");
    const commit = git("rev-parse", "HEAD");
    const codeSha = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
    const profile = path.join(scratch, "profiles.json");
    writeFileSync(profile, JSON.stringify({ test: { connectionString: url.href, hostname: url.hostname, port: Number(url.port || 5432), database, schema: "public" } }), { mode: 0o600 });
    const invoke = async (script: string, args: string[]) => {
      const result = await promisify(execFile)(process.execPath, ["--import", "tsx", `scripts/templates/${script}.ts`, "--profile-file", profile, "--environment", "test", ...args], {
        timeout: 15000, env: { ...process.env, DATABASE_URL: "must-not-be-used" },
      });
      return JSON.parse(result.stdout);
    };
    const audit = ["--actor", "fixture", "--code-sha", codeSha, "--workflow-run", "operator-integration"];
    const imported = await invoke("publish-templates", [...audit, "--request-id", "import", "--dir", source, "--commit", commit]);
    const snapshotPath = path.join(scratch, "snapshot.json");
    const snapshotInfo = await invoke("bootstrap-template-releases", ["--snapshot", snapshotPath]);
    const snapshot = JSON.parse(readFileSync(snapshotPath, "utf8"));
    assert.equal(snapshot.hash, snapshotInfo.snapshotHash);
    const evidencePath = path.join(scratch, "evidence.json");
    writeFileSync(evidencePath, JSON.stringify({ schemaVersion: 1, snapshotHash: snapshot.hash, targetIdentityHash: snapshot.targetIdentityHash, codeSha,
      maintenanceReference: "isolated synthetic fixture", writersDrained: true,
      readers: [{ identity: "fixture", codeSha, protocol: "template-release-v1" }], inventory: releaseRows().map(({ lang, path }) => ({ lang, path })), excluded: [], unboundRuns: [],
    }), { mode: 0o600 });
    const bootArgs = [...audit, "--request-id", "bootstrap", "--snapshot-file", snapshotPath, "--evidence-file", evidencePath];
    const boot = await invoke("bootstrap-template-releases", bootArgs);
    assert.equal(boot.revision, 1); assert.notEqual(boot.releaseId, imported.releaseId);
    assert.deepEqual(await invoke("bootstrap-template-releases", bootArgs), boot);
    const activateArgs = [...audit, "--request-id", "activate", "--release", imported.releaseId, "--expected-revision", "1"];
    const activated = await invoke("activate-templates", activateArgs);
    assert.equal(activated.revision, 2);
    assert.deepEqual(await invoke("activate-templates", activateArgs), activated);
    assert.deepEqual(await invoke("activate-templates", ["--result", "activate"]), activated);
    assert.deepEqual(await invoke("activate-templates", ["--status", "true"]), { mode: "versioned", revision: 2, activeReleaseId: imported.releaseId, legacyWritesBlocked: true });
    assert.equal(await db.templateDeployment.count(), 3);
  } finally {
    try { await db?.$disconnect(); if (created) await admin.query(`DROP DATABASE "${database}"`); }
    finally { await admin.end(); rmSync(scratch, { recursive: true }); }
  }
});

import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { promisify } from "node:util";

export const RECOVERY_MIGRATION = "20260914093000_restore_d2_ownership_shadow";
export const RECOVERY_SQL = "scripts/recovery/individual-project-availability-d3/restore-d2-shadow.sql";

export type RecoveryReceipt = {
  version: 1;
  database: string;
  schema: string;
  d2Artifact: string;
  d2MigrationsSha256: string;
  cleanupMigration: string;
  cleanupSqlSha256: string;
  recoveryMigration: string;
  recoverySqlSha256: string;
  backupReference: string;
  rehearsalEvidence: string;
};

const execFileAsync = promisify(execFile);
export const digest = (body: string | Buffer): string => createHash("sha256").update(body).digest("hex");

export function isRecoveryReceipt(value: unknown): value is RecoveryReceipt {
  if (typeof value !== "object" || value === null) return false;
  const receipt = value as Record<string, unknown>;
  const strings = ["database", "schema", "d2Artifact", "d2MigrationsSha256", "cleanupMigration", "cleanupSqlSha256", "recoveryMigration", "recoverySqlSha256", "backupReference", "rehearsalEvidence"];
  return receipt.version === 1 && strings.every((key) => typeof receipt[key] === "string" && receipt[key] !== "");
}

export async function artifactMigrationDigest(repositoryRoot: string, commit: string): Promise<string> {
  if (!/^[0-9a-f]{40}$/.test(commit)) throw new Error("D2 artifact must be a full commit id");
  await execFileAsync("git", ["cat-file", "-e", `${commit}^{commit}`], { cwd: repositoryRoot });
  const { stdout } = await execFileAsync("git", ["ls-tree", "-r", "--name-only", commit, "prisma/migrations"], { cwd: repositoryRoot });
  const paths = stdout.split("\n").filter((path) => path.endsWith("migration.sql") || path.endsWith("migration_lock.toml")).sort();
  if (paths.filter((path) => path.endsWith("migration.sql")).length !== 11) throw new Error("D2 artifact must contain exactly 11 migrations");
  const identities: Array<[string, string]> = [];
  for (const path of paths) {
    const file = await execFileAsync("git", ["show", `${commit}:${path}`], { cwd: repositoryRoot, encoding: "buffer", maxBuffer: 10 * 1024 * 1024 });
    identities.push([path, digest(file.stdout)]);
  }
  return digest(JSON.stringify(identities));
}

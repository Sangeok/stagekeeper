import { randomUUID } from "node:crypto";
import { manifestHash, prepareTemplateRelease, readTemplateContract } from "@harness/core/templates/release-manifest.mjs";
import type { TemplateRow, TemplateSource } from "@harness/core/templates/release-manifest.mjs";
import { buildVars, buildWorkspaceVars } from "@harness/core/templates/vars.mjs";
import { renderTemplate } from "@harness/core/templates/render.mjs";
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import type { ServerResult } from "@/server/result";
import { splitTemplate } from "./steps";

export type DeploymentAudit = { actor: string; environment: string; targetProfileId: string; targetIdentityHash: string; codeSha: string; workflowRun: string };
export type DeploymentResult = { releaseId: string; revision: number; previousReleaseId: string | null };
export type PublishTemplateInput = { requestId: string; source: TemplateSource; rows: TemplateRow[]; audit: DeploymentAudit };
export type ActivateTemplateInput = { requestId: string; releaseId: string; expectedRevision: number; audit: DeploymentAudit };

class ReleaseRejection extends Error {}
export function reject(reason: string): never { throw new ReleaseRejection(reason); }
const options = { isolationLevel: "Serializable", maxWait: 15_000, timeout: 30_000 } as const;

export function validateRenderContract(rows: TemplateRow[]): void {
  const config = { project: { owner: "contract", repo: "contract", branch: "dev", name: "contract" },
    workspaces: [{ id: "app", agent: "app-dev", path: ".", verify: ["npm test"], knowledge: null, readOnly: [] }], scout: null, release: null };
  for (const client of ["claude", "codex"] as const) for (const row of rows) {
    const vars = row.path === "agents/dev.md" ? buildWorkspaceVars(config, config.workspaces[0], client) : buildVars(config, client);
    renderTemplate(row.body, { ...vars, runbook_version: "000000000000", report_table: "Contract report table" });
  }
}

export function validateRequest(requestId: string, audit: DeploymentAudit): void {
  if (!/^[A-Za-z0-9._:-]{1,128}$/.test(requestId)) reject("Invalid template deployment request ID");
  if ([audit.actor, audit.environment, audit.targetProfileId, audit.workflowRun].some(value => typeof value !== "string" || !value.trim() || value.length > 200)
    || !/^[a-f0-9]{40}$/.test(audit.codeSha) || !/^[a-f0-9]{64}$/.test(audit.targetIdentityHash)) reject("Complete template deployment provenance is required");
}

function deploymentResult(value: Prisma.JsonValue): DeploymentResult {
  if (!value || typeof value !== "object" || Array.isArray(value)
    || typeof value.releaseId !== "string" || typeof value.revision !== "number"
    || !(value.previousReleaseId === null || typeof value.previousReleaseId === "string")) throw new Error("Invalid stored template deployment result");
  return { releaseId: value.releaseId, revision: value.revision, previousReleaseId: value.previousReleaseId };
}

export async function previousResult(tx: Prisma.TransactionClient, operation: string, requestId: string, inputHash: string): Promise<DeploymentResult | null> {
  const previous = await tx.templateDeployment.findUnique({ where: { operation_requestId: { operation, requestId } } });
  if (!previous) return null;
  if (previous.inputHash !== inputHash) reject("Request ID already belongs to a different template deployment input");
  return deploymentResult(previous.result);
}

export async function transact(db: PrismaClient, work: (tx: Prisma.TransactionClient) => Promise<DeploymentResult>): Promise<ServerResult<DeploymentResult>> {
  for (let attempt = 0; attempt < 4; attempt++) {
    try { return { ok: true, item: await db.$transaction(work, options) }; }
    catch (error) {
      if (error instanceof ReleaseRejection) return { ok: false, reason: error.message };
      const code = error && typeof error === "object" && "code" in error ? error.code : null;
      const meta = error && typeof error === "object" && "meta" in error ? error.meta : null;
      const adapter = meta && typeof meta === "object" && "driverAdapterError" in meta ? meta.driverAdapterError : null;
      const cause = adapter && typeof adapter === "object" && "cause" in adapter ? adapter.cause : null;
      const sqlState = cause && typeof cause === "object" && "originalCode" in cause ? cause.originalCode
        : meta && typeof meta === "object" && "code" in meta ? meta.code : null;
      if (code !== "P2034" && code !== "P2002" && !(code === "P2010" && (sqlState === "40001" || sqlState === "40P01"))) throw error;
      if (attempt === 3) return { ok: false, reason: "Concurrent template deployment; query or retry the same request ID and input" };
    }
  }
  throw new Error("Template transaction retry exhausted");
}

export async function publishTemplateRelease(db: PrismaClient, command: PublishTemplateInput): Promise<ServerResult<DeploymentResult>> {
  let input: PublishTemplateInput;
  let prepared: ReturnType<typeof prepareTemplateRelease>;
  try {
    input = structuredClone(command);
    validateRequest(input.requestId, input.audit);
    prepared = validateTemplateRelease(input.rows, input.source);
  } catch { return { ok: false, reason: "Template release validation failed; no rows were stored" }; }
  const inputHash = manifestHash({ source: input.source, identity: prepared.releaseIdentity, audit: input.audit });
  return transact(db, async tx => {
    const previous = await previousResult(tx, "import", input.requestId, inputHash);
    if (previous) return previous;
    const release = await storeTemplateReleaseIn(tx, prepared, input.source);
    const channel = await tx.templateChannel.findUnique({ where: { id: "default" } });
    const result: DeploymentResult = { releaseId: release.id, revision: channel?.revision ?? 0, previousReleaseId: channel?.activeReleaseId ?? null };
    await tx.templateDeployment.create({ data: { operation: "import", requestId: input.requestId, inputHash, releaseId: release.id, ...input.audit, result } });
    return result;
  });
}

export async function activateTemplateRelease(db: PrismaClient, command: ActivateTemplateInput): Promise<ServerResult<DeploymentResult>> {
  let input: ActivateTemplateInput;
  try {
    input = structuredClone(command);
    validateRequest(input.requestId, input.audit);
    if (!input.releaseId || !Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 0 || input.expectedRevision >= 2_147_483_647) reject("Invalid channel revision");
  } catch { return { ok: false, reason: "Template activation input is invalid" }; }
  const inputHash = manifestHash({ releaseId: input.releaseId, expectedRevision: input.expectedRevision, audit: input.audit });
  return transact(db, async tx => {
    const previous = await previousResult(tx, "activate", input.requestId, inputHash);
    if (previous) return previous;
    await tx.$queryRaw`SELECT "id" FROM "TemplateChannel" WHERE "id" = 'default' FOR UPDATE`;
    const channel = await tx.templateChannel.findUnique({ where: { id: "default" } });
    if (!channel || channel.mode !== "versioned" || !channel.legacyWritesBlocked) reject("Bootstrap and compatible readers are required before activation");
    if (channel.revision !== input.expectedRevision) reject("Stale template channel revision; inspect the current state before a new activation");
    const release = await tx.templateRelease.findUnique({ where: { id: input.releaseId } });
    if (!release?.sealedAt) reject("A sealed release with a supported interpretation contract is required");
    try { readTemplateContract(release.manifest, release.contractHash); } catch { reject("Unsupported template interpretation contract"); }
    const result: DeploymentResult = { releaseId: release.id, revision: channel.revision + 1, previousReleaseId: channel.activeReleaseId };
    await tx.templateChannel.update({ where: { id: "default", revision: input.expectedRevision }, data: { activeReleaseId: release.id, revision: result.revision } });
    await tx.templateDeployment.create({ data: { operation: "activate", requestId: input.requestId, inputHash, releaseId: release.id, ...input.audit, result } });
    return result;
  });
}

export async function readTemplateDeployment(db: PrismaClient, operation: "import" | "activate" | "bootstrap", requestId: string): Promise<DeploymentResult | null> {
  const row = await db.templateDeployment.findUnique({ where: { operation_requestId: { operation, requestId } } });
  return row ? deploymentResult(row.result) : null;
}

export async function storeTemplateReleaseIn(tx: Prisma.TransactionClient, prepared: ReturnType<typeof prepareTemplateRelease>, source: TemplateSource) {
    const inconsistent = await tx.templateRelease.findFirst({ where: { sourceKey: prepared.sourceKey, manifestVersion: 1, contentHash: { not: prepared.contentHash } }, select: { id: true } });
    if (inconsistent) reject("The immutable source was previously registered with different content");
    let release = await tx.templateRelease.findUnique({ where: { releaseIdentity: prepared.releaseIdentity } });
    if (release) {
      if (!release.sealedAt || release.contentHash !== prepared.contentHash || release.contractHash !== prepared.contractHash || release.sourceKey !== prepared.sourceKey
        || manifestHash(release.manifest) !== manifestHash(prepared.manifest) || manifestHash(release.source) !== manifestHash(source)) reject("Stored template release identity does not match the requested tuple");
    } else {
      release = await tx.templateRelease.create({ data: { id: randomUUID(), releaseIdentity: prepared.releaseIdentity, sourceKey: prepared.sourceKey,
        source: source, manifestVersion: 1, manifest: prepared.manifest, contentHash: prepared.contentHash, contractHash: prepared.contractHash, entryCount: prepared.rows.length } });
      await tx.templateReleaseEntry.createMany({ data: prepared.rows.map(row => ({ ...row, releaseId: release!.id })) });
      const stored = await tx.templateReleaseEntry.findMany({ where: { releaseId: release.id }, orderBy: [{ lang: "asc" }, { path: "asc" }], select: { lang: true, path: true, body: true } });
      const checked = prepareTemplateRelease(stored, source);
      if (checked.contentHash !== prepared.contentHash || stored.length !== prepared.rows.length) reject("Stored template release verification failed");
      release = await tx.templateRelease.update({ where: { id: release.id }, data: { sealedAt: new Date() } });
    }
    return release;
}

export function validateTemplateRelease(rows: TemplateRow[], source: TemplateSource) {
  const prepared = prepareTemplateRelease(rows, source);
  validateRenderContract(prepared.rows);
  for (const row of prepared.rows.filter(row => row.path.startsWith("agents/"))) if (!splitTemplate(row.body).steps.length) reject("Template agent has no steps");
  return prepared;
}

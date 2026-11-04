import { selectTemplateLanguage, readTemplateContract } from "@harness/core/templates/release-manifest.mjs";
import type { Prisma, PrismaClient, TemplateRelease } from "@/generated/prisma/client";
import type { ServerResult } from "@/server/result";
import type { TemplateRow, TemplateContract } from "@harness/core/templates/release-manifest.mjs";

export type TemplateReleaseBundle = { release: TemplateRelease; language: string; rows: TemplateRow[] };
export type TemplateDeliverySource = { id: string; contract: TemplateContract; contractHash: string; language: string; rows: TemplateRow[] };

export async function readTemplateChannel(db: PrismaClient | Prisma.TransactionClient) {
  return db.templateChannel.findUniqueOrThrow({ where: { id: "default" }, select: { mode: true, revision: true, activeReleaseId: true, legacyWritesBlocked: true } });
}

export async function readTemplateChannelMode(db: PrismaClient | Prisma.TransactionClient): Promise<"legacy" | "versioned"> {
  const { mode } = await db.templateChannel.findUniqueOrThrow({ where: { id: "default" } });
  if (mode !== "legacy" && mode !== "versioned") throw new Error("Unsupported template channel mode");
  return mode;
}

export async function readTemplateDelivery(db: PrismaClient | Prisma.TransactionClient, input: { releaseId?: string; language: string }): Promise<ServerResult<TemplateDeliverySource>> {
  const result = await readTemplateRelease(db, input);
  if (!result.ok) return result;
  const { release, language, rows } = result.item;
  return { ok: true, item: { id: release.id, contract: readTemplateContract(release.manifest, release.contractHash), contractHash: release.contractHash, language, rows } };
}

export async function readTemplateRelease(db: PrismaClient | Prisma.TransactionClient, input: { releaseId?: string; language: string }): Promise<ServerResult<TemplateReleaseBundle>> {
  const channel = await db.templateChannel.findUnique({ where: { id: "default" } });
  if (channel?.mode !== "versioned") return { ok: false, reason: "Template release protocol is not active" };
  const id = input.releaseId ?? channel.activeReleaseId;
  if (!id) return { ok: false, reason: "No active template release" };
  const release = await db.templateRelease.findUnique({ where: { id } });
  if (!release?.sealedAt) return { ok: false, reason: "Template release not found" };
  try { readTemplateContract(release.manifest, release.contractHash); } catch { return { ok: false, reason: "Unsupported template interpretation contract" }; }
  const rows = await db.templateReleaseEntry.findMany({ where: { releaseId: id }, select: { lang: true, path: true, body: true } });
  const language = selectTemplateLanguage([...new Set(rows.map(row => row.lang))], input.language);
  if (!language) return { ok: false, reason: "No complete language in the selected template release" };
  return { ok: true, item: { release, language, rows: rows.filter(row => row.lang === language) } };
}

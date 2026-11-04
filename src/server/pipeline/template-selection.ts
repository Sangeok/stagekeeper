import { compatibleInstallation, installationFor, readTemplateContract, selectTemplateLanguage } from "@harness/core/templates/release-manifest.mjs";
import type { Installation } from "@harness/core/templates/release-manifest.mjs";
import type { Prisma } from "@/generated/prisma/client";
import { readProjectAccessIn } from "@/server/projects/api";
import { PipelineRejection } from "./lock-pipeline";

export type TemplatePin = { templateReleaseId: string; templateLanguage: string; templatePinnedAt: Date; templatePinOrigin: string };
export type TemplateMetadata = { id: string; schemaVersion: 1; protocol: "template-release-v1"; language: string; clientSurfaceHash: string };
export type TemplateRunContext = { client?: "claude" | "codex"; installation?: Installation; requireInstallation?: boolean };

export class TemplateExecutionRejection extends PipelineRejection {}

export class TemplateInstallationRequired extends TemplateExecutionRejection {
  constructor(readonly templateRelease: TemplateMetadata) {
    super(`Update the installation to template release ${templateRelease.id} (${templateRelease.language}), then retry without the old outcome.`);
  }
}

export function templatePinFrom(row: { templateReleaseId: string | null; templateLanguage: string | null; templatePinnedAt: Date | null; templatePinOrigin: string | null }): TemplatePin {
  if (!row.templateReleaseId || !row.templateLanguage || !row.templatePinnedAt || !["run-start", "cutover"].includes(row.templatePinOrigin ?? "")) throw new TemplateExecutionRejection("This historical execution has no template selection; start a new owner-authorized run.");
  return { templateReleaseId: row.templateReleaseId, templateLanguage: row.templateLanguage, templatePinnedAt: row.templatePinnedAt, templatePinOrigin: row.templatePinOrigin! };
}

export async function assertTemplateInstallationIn(tx: Prisma.TransactionClient, projectId: string, pin: TemplatePin, context: TemplateRunContext): Promise<TemplateMetadata> {
  const release = await tx.templateRelease.findUnique({ where: { id: pin.templateReleaseId } });
  if (!release?.sealedAt) throw new TemplateExecutionRejection("Pinned template interpretation contract is unavailable.");
  let contract;
  try { contract = readTemplateContract(release.manifest, release.contractHash); } catch { throw new TemplateExecutionRejection("Pinned template interpretation contract is unavailable."); }
  const rows = await tx.templateReleaseEntry.findMany({ where: { releaseId: release.id, lang: pin.templateLanguage }, select: { lang: true, path: true, body: true } });
  if (!rows.length) throw new TemplateExecutionRejection("Pinned template language is unavailable.");
  const access = await readProjectAccessIn(tx, projectId);
  if (!access.available) throw new TemplateExecutionRejection(access.reason);
  const required = installationFor({ releaseId: release.id, rows, language: pin.templateLanguage, plan: access.plan, client: context.client ?? "claude", contractHash: release.contractHash, contract });
  const metadata: TemplateMetadata = { id: required.releaseId, schemaVersion: 1, protocol: required.protocol, language: required.language, clientSurfaceHash: required.clientSurfaceHash };
  if (context.requireInstallation && !compatibleInstallation(context.installation, required)) throw new TemplateInstallationRequired(metadata);
  return metadata;
}

export async function selectTemplateReleaseForRunIn(tx: Prisma.TransactionClient, input: { projectId: string; parentRunId?: string; parentWorkRunId?: string; context?: TemplateRunContext }): Promise<TemplatePin | null> {
  const channel = await tx.templateChannel.findUniqueOrThrow({ where: { id: "default" } });
  if (channel.mode === "legacy") return null;
  if (channel.mode !== "versioned") throw new TemplateExecutionRejection("Unsupported template channel mode.");
  let pin: TemplatePin;
  if (input.parentWorkRunId) {
    const parent = await tx.pipelineWorkRun.findUnique({ where: { id: input.parentWorkRunId } });
    if (!parent || parent.projectId !== input.projectId) throw new TemplateExecutionRejection("Template parent execution unavailable.");
    pin = templatePinFrom(parent);
  } else if (input.parentRunId) {
    const parent = await tx.pipelineRun.findUnique({ where: { id: input.parentRunId }, include: { boardItem: { select: { projectId: true } } } });
    if (!parent || parent.boardItem.projectId !== input.projectId) throw new TemplateExecutionRejection("Template parent execution unavailable.");
    pin = templatePinFrom(parent);
  } else {
    await tx.$queryRaw`SELECT "id" FROM "TemplateChannel" WHERE id = 'default' FOR SHARE`;
    const current = await tx.templateChannel.findUniqueOrThrow({ where: { id: "default" } });
    if (!current.activeReleaseId) throw new TemplateExecutionRejection("No active template release.");
    const project = await tx.project.findUniqueOrThrow({ where: { id: input.projectId }, select: { language: true } });
    const languages = await tx.templateReleaseEntry.findMany({ where: { releaseId: current.activeReleaseId }, distinct: ["lang"], select: { lang: true } });
    const language = selectTemplateLanguage(languages.map(row => row.lang), project.language);
    if (!language) throw new TemplateExecutionRejection("No complete language in the active template release.");
    pin = { templateReleaseId: current.activeReleaseId, templateLanguage: language, templatePinnedAt: new Date(), templatePinOrigin: "run-start" };
  }
  await assertTemplateInstallationIn(tx, input.projectId, pin, input.context ?? {});
  return pin;
}

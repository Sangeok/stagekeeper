import type { PrismaClient } from "@/generated/prisma/client";
import { readProjectAccess } from "@/server/projects/api";
import { readCodexBundle } from "./client-bundle-query";

export async function resolveCodexBundle(projectId: string, db: PrismaClient): Promise<Awaited<ReturnType<typeof readCodexBundle>>> {
  const project = await db.project.findUniqueOrThrow({ where: { id: projectId }, select: { language: true } });
  const access = await readProjectAccess(db, projectId);
  if (!access.available) return { ok: false as const, reason: access.reason };
  return readCodexBundle(language => db.template.findMany({ where: { lang: language }, select: { path: true, body: true } }), project.language, access.plan, true);
}

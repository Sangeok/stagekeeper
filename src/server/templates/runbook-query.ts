import type { PrismaClient } from "@/generated/prisma/client";
import { RUNBOOK_TEMPLATE, isRunbookVersion, runbookIsStale } from "@harness/core/templates/runbook.mjs";

export async function runbookStale(projectId: string, db: PrismaClient, reported?: string): Promise<boolean> {
  const rows = await db.template.findMany({ where: { path: RUNBOOK_TEMPLATE }, select: { body: true } });
  const bodies = rows.map((row) => row.body);
  if (isRunbookVersion(reported)) return runbookIsStale(reported, bodies);
  const project = await db.project.findUnique({ where: { id: projectId }, select: { runbookVersion: true } });
  return runbookIsStale(project?.runbookVersion ?? null, bodies);
}

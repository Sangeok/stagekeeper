import { repositoryOwner } from "./access-query";
import type { PrismaClient } from "@/generated/prisma/client";

export async function loadProjectRepository(db: Pick<PrismaClient, "project">, projectId: string): Promise<{ owner: string; repo: string; branch: string }> {
  const project = await db.project.findUniqueOrThrow({
    where: { id: projectId },
    select: { repoOwner: true, repo: true, branch: true },
  });
  return { owner: repositoryOwner(project.repoOwner), repo: project.repo, branch: project.branch };
}

export async function loadProjectRoster(db: Pick<PrismaClient, "workspace">, projectId: string): Promise<string[]> {
  const rows = await db.workspace.findMany({ where: { projectId }, orderBy: { wsId: "asc" }, select: { agent: true } });
  return rows.map((w) => w.agent);
}

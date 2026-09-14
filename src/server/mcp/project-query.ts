import type { Prisma } from "@/generated/prisma/client";
import { repositoryOwner } from "../project-access-query";

export const PROJECT_GET_SELECT = {
  id: true,
  slug: true,
  name: true,
  repoOwner: true,
  repo: true,
  branch: true,
  language: true,
  executorKind: true,
  commandIssue: true,
  runbookVersion: true,
  createdAt: true,
  workspaces: {
    select: {
      id: true,
      projectId: true,
      wsId: true,
      path: true,
      agent: true,
      verify: true,
      knowledge: true,
      readOnly: true,
    },
  },
} as const satisfies Prisma.ProjectSelect;

export type ProjectQueryView = Prisma.ProjectGetPayload<{ select: typeof PROJECT_GET_SELECT }>;

export type ProjectFinder = (args: {
  where: Prisma.ProjectWhereUniqueInput;
  select: typeof PROJECT_GET_SELECT;
}) => Promise<ProjectQueryView>;

export async function loadProjectView(finder: ProjectFinder, projectId: string): Promise<Omit<ProjectQueryView, "repoOwner"> & { owner: string }> {
  const { repoOwner, ...project } = await finder({ where: { id: projectId }, select: PROJECT_GET_SELECT });
  return { ...project, owner: repositoryOwner(repoOwner) };
}

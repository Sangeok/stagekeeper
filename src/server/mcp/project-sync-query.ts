import { capReason, withinLimit } from "@harness/core/entitlement.mjs";
import { readProjectAccess, type TransactionHost } from "../project-access-query";
import type { ServerResult } from "../result";
import type { WorkspaceInput } from "./tools";

export async function syncProject(
  client: TransactionHost,
  input: { projectId: string; workspaces: WorkspaceInput[]; language?: string; clock?: () => Date },
): Promise<ServerResult<number>> {
  const { projectId, workspaces, language } = input;
  const access = await readProjectAccess(client, projectId);
  if (!access.available) return { ok: false, reason: access.reason };
  if (!withinLimit(access.plan, "workspaces", workspaces.length)) {
    return { ok: false, reason: `${capReason(access.plan, "workspaces")}: harness.json has ${workspaces.length} workspaces. Drop workspaces or upgrade the plan.` };
  }
  await client.$transaction(async (tx) => {
    await tx.project.update({ where: { id: projectId }, data: { ...(language === undefined ? {} : { language }), lastSyncedAt: (input.clock ?? (() => new Date()))() } });
    for (const w of workspaces) {
      const data = { wsId: w.id, path: w.path, verify: w.verify, knowledge: w.knowledge, readOnly: w.readOnly };
      await tx.workspace.upsert({ where: { projectId_agent: { projectId, agent: w.agent } }, create: { ...data, projectId, agent: w.agent }, update: data });
    }
  });
  return { ok: true, item: workspaces.length };
}

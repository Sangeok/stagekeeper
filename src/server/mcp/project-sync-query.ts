import { validateWorkspaceSemantics } from "@harness/core/workspaces.mjs";
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
  try { validateWorkspaceSemantics(workspaces); } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : "invalid workspaces" };
  }
  try {
    return await client.$transaction(async (tx) => {
      const existing = await tx.workspace.findMany({ where: { projectId }, select: { agent: true } });
      const count = new Set([...existing.map((w) => w.agent), ...workspaces.map((w) => w.agent)]).size;
      if (!withinLimit(access.plan, "workspaces", count)) {
        return { ok: false as const, reason: `${capReason(access.plan, "workspaces")}: stored roster has ${existing.length} workspaces; upsert would leave ${count}. Omitted agents remain stored. Upgrade the plan or arrange roster cleanup.` };
      }
      await tx.project.update({ where: { id: projectId }, data: { ...(language === undefined ? {} : { language }), lastSyncedAt: (input.clock ?? (() => new Date()))() } });
      for (const w of workspaces) {
        const data = { wsId: w.id, path: w.path, verify: w.verify, knowledge: w.knowledge, readOnly: w.readOnly };
        await tx.workspace.upsert({ where: { projectId_agent: { projectId, agent: w.agent } }, create: { ...data, projectId, agent: w.agent }, update: data });
      }
      return { ok: true as const, item: workspaces.length };
    }, { isolationLevel: "Serializable" });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "P2034") return { ok: false, reason: "workspace sync conflicted; retry project_sync" };
    throw error;
  }
}

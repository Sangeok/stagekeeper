"use server";
import { revalidatePath } from "next/cache";
import { allowsPipelineEdit, validateGraph } from "@harness/core/pipeline.mjs";
import { Prisma } from "@/generated/prisma/client";
import { type ActionResult, failure, success } from "@/fsd/shared/api/result";
import { projectPath } from "@/fsd/shared/routes/project";
import { requireProjectWrite } from "@/server/auth/guard";
import { prisma } from "@/server/db";
import { planForProject } from "@/server/entitlement";
export async function savePipeline(slug: string, graph: { nodes: string[]; gates: string[] }): Promise<ActionResult<void>> {
  const w = await requireProjectWrite(slug);
  if (!w.ok) return failure(w.reason);
  const plan = await planForProject(w.projectId);
  if (!allowsPipelineEdit(plan)) return failure("Pipeline editing opens on Pro. The default pipeline stays as is.");
  const v = validateGraph(graph, plan) as { ok: boolean; reason?: string };
  if (!v.ok) return failure(v.reason ?? "invalid");
  const latest = await prisma.pipelineVersion.findFirst({ where: { projectId: w.projectId }, orderBy: { version: "desc" }, select: { version: true } });
  try {
    await prisma.pipelineVersion.create({ data: { projectId: w.projectId, version: (latest?.version ?? 0) + 1, nodes: graph.nodes, gates: graph.gates, createdBy: w.userId } });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return failure("The pipeline changed. Refresh and try again.");
    throw e;
  }
  revalidatePath(projectPath(slug, "/pipeline"));
  return success();
}

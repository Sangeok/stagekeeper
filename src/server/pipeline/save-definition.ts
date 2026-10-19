import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@/generated/prisma/client";
import { recompose, SLOT_FORMAT, validateDefinition, type Definition, type GraphInput } from "@harness/core/pipeline.mjs";
import { PipelineRejection, requirePipelineEdit, withPipelineWrite } from "./lock-pipeline";
import { ensureDefaultPipeline, ensureRunnableVersion, loadPipelinesViewIn, nextPipelineVersion, PIPELINE_NOT_FOUND } from "./run-service";

export type SaveInput = {
  projectId: string; userId: string; pipelineId: string | null; name?: string;
  definition: Definition; expectedVersion: number;
};
export type SaveResult = { status: "success"; pipelineId: string; version: number }
  | { status: "stale" } | { status: "error"; reason: string };
class StaleDefinition extends Error {}

function validInput(input: SaveInput): boolean {
  return !!input && typeof input.projectId === "string" && typeof input.userId === "string"
    && (input.pipelineId === null || typeof input.pipelineId === "string")
    && (input.name === undefined || typeof input.name === "string")
    && Number.isInteger(input.expectedVersion) && input.expectedVersion >= 0 && input.expectedVersion <= 2_147_483_646
    && !!input.definition && Array.isArray(input.definition.steps) && input.definition.steps.every(step => typeof step === "string")
    && Array.isArray(input.definition.gates) && input.definition.gates.every(gate => typeof gate === "string")
    && (input.pipelineId !== null || input.expectedVersion === 0);
}

function sameGraph(before: GraphInput & { format: string | null }, after: GraphInput): boolean {
  return before.format === SLOT_FORMAT && before.nodes.length === after.nodes.length
    && before.nodes.every((node, index) => node === after.nodes[index])
    && new Set(before.gates).size === new Set(after.gates).size
    && after.gates.every(gate => before.gates.includes(gate));
}

export async function savePipelineDefinition(client: PrismaClient, input: SaveInput): Promise<SaveResult> {
  if (!validInput(input)) return { status: "error", reason: "Invalid pipeline save request." };
  try {
    return await withPipelineWrite(client, input.projectId, input.userId, async ({ tx, plan }) => {
      requirePipelineEdit(plan);
      const view = await loadPipelinesViewIn(tx, input.projectId);
      const current = view.pipelines.find(pipeline => pipeline.id === input.pipelineId);
      if (input.pipelineId !== null && !current) throw new PipelineRejection(PIPELINE_NOT_FOUND);
      if ((current?.saved?.version ?? 0) !== input.expectedVersion) throw new StaleDefinition();
      const name = input.name?.trim() ?? "";
      if (input.pipelineId === null) {
        if (name.length < 1 || name.length > 40) throw new PipelineRejection("Use 1 to 40 characters for the pipeline name.");
        if (view.pipelines.some(pipeline => pipeline.name === name)) throw new PipelineRejection("Another pipeline already uses this name. Choose a different one.");
      }
      const valid = validateDefinition(input.definition, plan);
      if (!valid.ok) throw new PipelineRejection(valid.reason);
      const changedId = input.pipelineId ?? "draft:new";
      const definitions: Record<string, Definition> = Object.create(null);
      for (const pipeline of view.pipelines) definitions[pipeline.id] = pipeline.definition;
      definitions[changedId] = input.definition;
      const mustRun = view.pipelines.filter(pipeline => pipeline.isDefault || pipeline.runnable !== null || Object.values(view.rules).includes(pipeline.id)).map(pipeline => pipeline.id);
      const composed = recompose(changedId, definitions, mustRun, plan);
      if (!composed.ok) {
        const broken = view.pipelines.find(pipeline => pipeline.id === composed.pipelineId);
        throw new PipelineRejection(composed.pipelineId === changedId ? composed.reason : `Saving would break ${broken?.name ?? composed.pipelineId}: ${composed.reason}`);
      }
      const writes = Object.entries(composed.runnable).flatMap(([id, graph]) => {
        if (!graph) return [];
        const before = view.pipelines.find(pipeline => pipeline.id === id);
        return before?.saved && before.runnable && sameGraph(before.runnable, graph) ? [] : [{ id, graph }];
      });
      const defaultPipeline = view.pipelines.find(pipeline => pipeline.isDefault)!;
      const preserveDefault = defaultPipeline.saved === null && changedId !== defaultPipeline.id;
      let version = await nextPipelineVersion(tx, input.projectId, writes.length + Number(preserveDefault));
      await ensureDefaultPipeline(tx, input.projectId);
      if (preserveDefault) {
        await ensureRunnableVersion(tx, input.projectId, defaultPipeline.id);
        version++;
      }
      const pipelineId = input.pipelineId ?? randomUUID();
      if (input.pipelineId === null) await tx.pipeline.create({ data: { id: pipelineId, projectId: input.projectId, name, createdBy: input.userId } });
      const definitionVersion = input.expectedVersion + 1;
      await tx.pipelineDefinition.create({ data: { pipelineId, version: definitionVersion, ...input.definition, createdBy: input.userId } });
      for (const write of writes) {
        await tx.pipelineVersion.create({ data: {
          projectId: input.projectId, pipelineId: write.id === changedId ? pipelineId : write.id,
          version: version++, nodes: write.graph.nodes, gates: write.graph.gates, format: SLOT_FORMAT, createdBy: input.userId,
        } });
      }
      return { status: "success", pipelineId, version: definitionVersion };
    });
  } catch (error) {
    if (error instanceof StaleDefinition) return { status: "stale" };
    if (error instanceof PipelineRejection) return { status: "error", reason: error.message };
    throw error;
  }
}

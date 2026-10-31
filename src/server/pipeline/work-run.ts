import { createHash, randomUUID } from "node:crypto";
import { DEFAULT_SELECTION_POLICY, isGateId, nextAfter, sequence, slotAgent, workPrefix } from "@harness/core/pipeline/pipeline.mjs";
import { matchingAgents, type SelectionContext } from "@harness/core/pipeline/work-selection.mjs";
import { isOpen } from "@harness/core/pipeline/transitions.mjs";
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { readProjectUsageCapIn } from "@/server/usage/api";
import type { ServerResult } from "@/server/result";
import { PipelineRejection, withPipelineWrite } from "./lock-pipeline";
import { ensureExecutionVersion, loadPipelinesViewIn, type PipelineEntry } from "./run-service";
import { executionKey } from "./run-request";

type Tx = Prisma.TransactionClient;
export type WorkNext = { action: "dispatch"; agent: string; hint: string; entry: PipelineEntry }
  | { action: "none"; reason: string; code?: "USAGE_LIMIT_REACHED"; resetAt?: string };
const hash = (value: unknown): string => createHash("sha256").update(JSON.stringify(value)).digest("hex");

export async function workInputs(tx: Tx, projectId: string): Promise<{ context: Omit<SelectionContext, "policy" | "contextKey">; inputKey: string; openCount: number }> {
  const backlog = await tx.backlogItem.findMany({ where: { projectId, removedAt: null }, orderBy: [{ createdAt: "asc" }, { key: "asc" }] });
  const board = await tx.boardItem.findMany({ where: { projectId, discardedAt: null }, distinct: ["backlogItemId"], orderBy: { proposedOn: "desc" }, select: { backlogItemId: true, status: true, agent: true } });
  const workspaces = await tx.workspace.findMany({ where: { projectId }, orderBy: { agent: "asc" }, select: { agent: true, path: true } });
  const rules = await tx.pipelineRule.findMany({ where: { projectId }, orderBy: { type: "asc" }, select: { type: true, pipelineId: true } });
  const candidates = backlog.map(item => {
    const row = board.find(current => current.backlogItemId === item.id);
    const agents = matchingAgents(item.area, workspaces);
    const reason = row && (isOpen(row.status) || row.status === "on_hold" || row.status === "done") ? "Already assigned, completed or on hold."
      : !item.source.trim() ? "Add supporting Source evidence." : !agents.length ? "Clarify the workspace area before assigning." : null;
    return { key: item.key, title: item.title, area: item.area, source: item.source, type: item.type, createdAt: item.createdAt.toISOString(), agents, eligible: reason === null, reason };
  });
  return { context: { candidates }, inputKey: hash([candidates, board, workspaces, rules]), openCount: board.filter(row => isOpen(row.status)).length };
}

export async function selectionContextIn(tx: Tx, projectId: string, runId: string): Promise<SelectionContext> {
  const agent = await tx.agentRun.findFirst({ where: { id: runId, projectId, agent: "work-assigner", closedAt: null }, include: { workRun: { include: { version: true } } } });
  const run = agent?.workRun;
  if (!run || run.closedAt || run.assignedBoardItemId || run.node !== "assign-work" || agent?.workEntryId !== run.entryId) throw new PipelineRejection("Read assignment_context from the current Assign work run.");
  const input = await workInputs(tx, projectId);
  const policy = run.version.selectionPolicy ?? DEFAULT_SELECTION_POLICY;
  return { ...input.context, policy, contextKey: hash([run.id, run.entryId, input.inputKey, policy]) };
}

export async function assignmentContext(db: PrismaClient, projectId: string, runId: string): Promise<ServerResult<SelectionContext>> {
  try { return { ok: true, item: await db.$transaction(tx => selectionContextIn(tx, projectId, runId)) }; }
  catch (error) {
    if (error instanceof PipelineRejection) return { ok: false, reason: error.message };
    throw error;
  }
}

export async function projectWorkNext(db: PrismaClient, projectId: string): Promise<WorkNext> {
  try { return await withPipelineWrite(db, projectId, undefined, async ({ tx }) => {
    const project = await tx.project.findUniqueOrThrow({ where: { id: projectId }, select: { workPipelineId: true, workAutomationPaused: true } });
    if (project.workAutomationPaused) return { action: "none", reason: "New work is stopped. Start a pipeline in Run to resume." };
    const inputs = await workInputs(tx, projectId);
    let run = await tx.pipelineWorkRun.findFirst({ where: { projectId, closedAt: null }, include: { version: true } });
    if (!run) {
      const view = await loadPipelinesViewIn(tx, projectId);
      const pipeline = view.pipelines.find(item => project.workPipelineId ? item.id === project.workPipelineId : item.isDefault);
      if (!pipeline) return { action: "none", reason: "Choose an available pipeline in Run." };
      const version = await ensureExecutionVersion(tx, projectId, pipeline.id);
      const prefix = workPrefix(version);
      if (!prefix.nodes.length) return { action: "none", reason: "This pipeline has no Assign work step. Choose work in Run, or add Assign work." };
      const prior = await tx.pipelineWorkRun.findFirst({ where: { projectId }, orderBy: { createdAt: "desc" } });
      if (prior?.versionId === version.id && prior.inputKey === inputs.inputKey && !prior.assignedBoardItemId) return { action: "none", reason: prior.waitReason ?? "Waiting for backlog changes." };
      if (inputs.openCount >= 2) return { action: "none", reason: "Two items are open. Waiting for room on the board." };
      run = await tx.pipelineWorkRun.create({ data: { projectId, versionId: version.id, node: sequence(prefix)[0], entryId: randomUUID(), inputKey: inputs.inputKey }, include: { version: true } });
    }
    const prefix = workPrefix(run.version);
    for (let remaining = sequence(prefix).length + 1; remaining > 0; remaining--) {
      if (run.assignedBoardItemId) {
        const openAgent = await tx.agentRun.findFirst({ where: { workRunId: run.id, closedAt: null }, select: { id: true } });
        if (openAgent) return { action: "dispatch", agent: "work-assigner", entry: { runId: run.id, entryId: run.entryId, slotId: run.node }, hint: "The item was registered. Finish the current agent_next run; do not assign another item." };
        await tx.pipelineWorkRun.update({ where: { id: run.id }, data: { closedAt: new Date(), inputKey: inputs.inputKey } });
        return { action: "none", reason: "Work assigned. The next cycle checks remaining candidates." };
      }
      if (isGateId(run.node)) return { action: "none", reason: "An approval gate is waiting. Open this pipeline's Run panel to approve it." };
      const agent = slotAgent(run.node);
      if (!agent) throw new PipelineRejection("Unsupported work step.");
      const execution = await tx.agentRun.findFirst({ where: { workRunId: run.id, workEntryId: run.entryId }, orderBy: { openedAt: "desc" }, include: { steps: { where: { accepted: true }, orderBy: { at: "desc" } } } });
      const failure = execution?.steps.find(step => step.outcome === "failed" || step.outcome === "blocked");
      if (failure) {
        const reason = failure.note ?? "More evidence or clarification is needed before this step can continue.";
        if (run.inputKey !== inputs.inputKey) {
          await tx.agentRun.updateMany({ where: { workRunId: run.id, closedAt: null }, data: { closedAt: new Date() } });
          await tx.pipelineWorkRun.update({ where: { id: run.id }, data: { closedAt: new Date(), waitReason: reason } });
        } else await tx.pipelineWorkRun.update({ where: { id: run.id }, data: { waitReason: reason } });
        return { action: "none", reason };
      }
      const discovery = agent === "work-discoverer" || agent === "feature-scout";
      const skipDiscovery = !execution && discovery && prefix.nodes.includes("assign-work") && inputs.context.candidates.some(candidate => candidate.eligible);
      if (execution?.closedAt && discovery && !execution.steps.some(step => step.stepId === "report" && step.outcome === "ok")) {
        const reason = "Discover work ended without a completed report. Start a new run to retry.";
        await tx.pipelineWorkRun.update({ where: { id: run.id }, data: { closedAt: new Date(), waitReason: reason, inputKey: inputs.inputKey } });
        return { action: "none", reason };
      }
      if (execution?.closedAt || skipDiscovery) {
        if (run.node === "assign-work") {
          await tx.pipelineWorkRun.update({ where: { id: run.id }, data: { closedAt: new Date(), inputKey: inputs.inputKey, waitReason: "No work was assigned. Add evidence or clarify the selection policy." } });
          return { action: "none", reason: "No work was assigned. Add evidence or clarify the selection policy." };
        }
        const next = nextAfter(prefix, run.node);
        if (!next) {
          await tx.pipelineWorkRun.update({ where: { id: run.id }, data: { closedAt: new Date(), inputKey: inputs.inputKey, waitReason: "Waiting for backlog changes." } });
          return { action: "none", reason: "Waiting for backlog changes." };
        }
        run = await tx.pipelineWorkRun.update({ where: { id: run.id }, data: { node: next, entryId: randomUUID(), inputKey: inputs.inputKey, waitReason: null }, include: { version: true } });
        continue;
      }
      const waiting = run.node === "assign-work" && inputs.openCount >= 2 ? "Two items are open. Waiting for room on the board."
        : run.node === "assign-work" && !inputs.context.candidates.some(candidate => candidate.eligible) ? "No eligible backlog items. Add Source evidence and a workspace area, or add new work." : null;
      if (waiting) {
        if (run.waitReason !== waiting) await tx.pipelineWorkRun.update({ where: { id: run.id }, data: { waitReason: waiting } });
        return { action: "none", reason: waiting };
      }
      if (run.waitReason) await tx.pipelineWorkRun.update({ where: { id: run.id }, data: { waitReason: null, inputKey: inputs.inputKey } });
      const cap = await readProjectUsageCapIn(tx, projectId);
      if (cap && !execution) return { action: "none", reason: cap.reason, code: cap.code, resetAt: cap.resetAt };
      return { action: "dispatch", agent, entry: { runId: run.id, entryId: run.entryId, slotId: run.node }, hint: run.node === "assign-work"
        ? "Read assignment_context with your agent_next receipt runId. Follow the saved policy. Record evidence, comparisons and readiness before board_propose. Never invent missing facts."
        : discovery ? "Discover evidence-backed work and add it to the backlog. Follow this exact pipeline entry and finish agent_next."
        : "Run this project step with the exact pipeline entry, then finish agent_next." };
    }
    throw new PipelineRejection("The work pipeline could not advance.");
  }); } catch (error) {
    if (error instanceof PipelineRejection) return { action: "none", reason: error.message };
    throw error;
  }
}

export async function startProjectWork(db: PrismaClient, projectId: string, userId: string, pipelineId: string, graphKey: string): Promise<ServerResult<null>> {
  try {
    return await withPipelineWrite(db, projectId, userId, async ({ tx }) => {
      const version = await ensureExecutionVersion(tx, projectId, pipelineId);
      const actualKey = executionKey(version);
      if (actualKey !== graphKey) throw new PipelineRejection("The saved pipeline changed. Reopen Run.");
      const prefix = workPrefix(version);
      if (!prefix.nodes.length) throw new PipelineRejection("Choose work for this pipeline.");
      if (await tx.pipelineWorkRun.findFirst({ where: { projectId, closedAt: null } })) throw new PipelineRejection("A project run is already active. Continue it before starting another.");
      const inputs = await workInputs(tx, projectId);
      await tx.project.update({ where: { id: projectId }, data: { workPipelineId: pipelineId, workAutomationPaused: false } });
      await tx.pipelineWorkRun.create({ data: { projectId, versionId: version.id, node: sequence(prefix)[0], entryId: randomUUID(), inputKey: inputs.inputKey } });
      return { ok: true, item: null };
    });
  } catch (error) {
    if (error instanceof PipelineRejection) return { ok: false, reason: error.message };
    throw error;
  }
}

export async function stopProjectWork(db: PrismaClient, projectId: string, userId: string, runId: string): Promise<ServerResult<null>> {
  try {
    return await withPipelineWrite(db, projectId, userId, async ({ tx }) => {
      const run = await tx.pipelineWorkRun.findFirst({ where: { id: runId, projectId, closedAt: null } });
      if (!run) throw new PipelineRejection("The run changed. Reopen Run.");
      await tx.agentRun.updateMany({ where: { workRunId: run.id, closedAt: null }, data: { closedAt: new Date() } });
      await tx.pipelineWorkRun.update({ where: { id: run.id }, data: { closedAt: new Date(), waitReason: "Stopped by the owner." } });
      await tx.project.update({ where: { id: projectId }, data: { workAutomationPaused: true } });
      return { ok: true, item: null };
    });
  } catch (error) {
    if (error instanceof PipelineRejection) return { ok: false, reason: error.message };
    throw error;
  }
}

export async function approveWorkGate(db: PrismaClient, projectId: string, userId: string, entry: PipelineEntry): Promise<ServerResult<null>> {
  try {
    return await withPipelineWrite(db, projectId, userId, async ({ tx }) => {
      const run = await tx.pipelineWorkRun.findFirst({ where: { id: entry.runId, projectId, entryId: entry.entryId, node: entry.slotId, closedAt: null }, include: { version: true } });
      if (!run || !isGateId(run.node)) throw new PipelineRejection("The approval changed. Reopen Run.");
      const next = nextAfter(workPrefix(run.version), run.node);
      if (!next) throw new PipelineRejection("This gate has no next step.");
      await tx.pipelineWorkRun.update({ where: { id: run.id }, data: { node: next, entryId: randomUUID(), waitReason: null,
        approvals: [...(Array.isArray(run.approvals) ? run.approvals : []), { node: run.node, entryId: run.entryId, userId, at: new Date().toISOString() }] as Prisma.InputJsonArray } });
      return { ok: true, item: null };
    });
  } catch (error) {
    if (error instanceof PipelineRejection) return { ok: false, reason: error.message };
    throw error;
  }
}

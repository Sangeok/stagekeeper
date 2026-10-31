import { z } from "zod";
import type { ActionResult } from "@/fsd/shared/api/result";

export const startPipelineInputSchema = z.object({
  pipelineId: z.string().min(1).max(200), graphKey: z.string().regex(/^[a-f0-9]{64}$/),
  targetId: z.string().min(1).max(200), targetKind: z.enum(["backlog", "board"]),
  agent: z.string().max(100), expectedUpdatedAt: z.iso.datetime().nullable(),
});
export type StartPipelineInput = z.infer<typeof startPipelineInputSchema>;
export type RunTarget = { id: string; kind: "backlog" | "board"; key: string; title: string; agent: string | null; updatedAt: string | null; reason: string | null };
export type RunPreparation = { pipelineId: string; name: string; graphKey: string; nodes: string[]; gates: string[]; agents: string[]; targets: RunTarget[]; canStartWithoutWork?: boolean; projectRun?: { id: string; pipelineName: string; entryId: string; node: string; reason: string | null; closed: boolean } };
export type PipelineRunActions = {
  prepare: (pipelineId: string) => Promise<ActionResult<RunPreparation>>;
  start: (input: StartPipelineInput) => Promise<ActionResult<{ href: string }>>;
  startProject?: (pipelineId: string, graphKey: string) => Promise<ActionResult<{ href: string }>>;
  stopProject?: (runId: string) => Promise<ActionResult<null>>;
  approveProjectGate?: (entry: { runId: string; entryId: string; slotId: string }) => Promise<ActionResult<null>>;
};

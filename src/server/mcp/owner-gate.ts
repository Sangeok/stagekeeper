import type { BoardItem } from "@/generated/prisma/client";
import type { Caller } from "@/server/pipeline/contracts";
import type { PipelineNext } from "@/server/pipeline/contracts";
import type { ServerResult } from "@/server/result";
import type { OwnerToolDeps } from "./owner-tools";

export const APPROVED_ADVICE_FAILURE = "The gate approval was recorded, but next advice could not be loaded. Call pipeline_next with the item key; do not retry gate_approve.";

type GateInput = Parameters<OwnerToolDeps["gate"]>[2];
type OwnerGateDependencies = {
  latestRow(projectId: string, key: string): Promise<{ updatedAt: Date } | null>;
  gate(projectId: string, input: GateInput, caller: Extract<Caller, { actor: "human" }>): Promise<ServerResult<BoardItem>>;
  advice(projectId: string, key: string): Promise<PipelineNext>;
};

export function createOwnerGate(deps: OwnerGateDependencies): OwnerToolDeps["gate"] {
  return async (projectId, userId, input) => {
    const row = await deps.latestRow(projectId, input.key);
    if (!row) return { ok: false, reason: `no such board item: ${input.key}` };
    const written = await deps.gate(projectId, input, {
      actor: "human", actorRef: userId, channel: "session", expectedUpdatedAt: row.updatedAt,
    });
    if (!written.ok) return written;
    try {
      return { ok: true, item: { item: written.item, next: await deps.advice(projectId, input.key) } };
    } catch {
      return { ok: false, reason: APPROVED_ADVICE_FAILURE };
    }
  };
}

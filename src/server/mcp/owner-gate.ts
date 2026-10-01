import type { BoardItem } from "@/generated/prisma/client";
import type { Caller } from "@/server/pipeline/board-query";
import type { PipelineNext } from "@/server/pipeline/run-rules";
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
    // 성공 응답을 받은 mutation만 저장을 확정한다. commit 결과 불명의 예외는 이 catch 밖에 둔다.
    try {
      return { ok: true, item: { item: written.item, next: await deps.advice(projectId, input.key) } };
    } catch {
      // DB 예외나 credential 대신 확정된 저장 사실과 읽기 복구 방법만 wire로 보낸다.
      return { ok: false, reason: APPROVED_ADVICE_FAILURE };
    }
  };
}

import { countNoun } from "@/fsd/shared/lib/count-noun";
import { planLabel } from "@/fsd/shared/lib/entitlement-copy";

export type ProjectConnectionTarget = { id: string; name: string; repoOwner: string; repo: string; disconnectedAt: string | null };
export type ProjectConnectionSummary = {
  plan: "free" | "pro" | "max"; limit: number | null; version: number; connectedCount: number;
};
export type ProjectConnectionState = { status: "success" } | { status: "stale" } | { status: "error"; reason: string };
export type ProjectConnectionAction = (input: { targetProjectId: string; expectedVersion: number }) => Promise<ProjectConnectionState>;
export const STALE_CONNECTION_MESSAGE = "Your project list changed. Review the latest connection details and try again.";
export const UNKNOWN_CONNECTION_MESSAGE = "Couldn't confirm the result. Refresh to check the latest repository connection.";

// "connection:" 접두사는 같은 행의 형제인 사용 선택 컨트롤 key(select-project-for-use)와 겹치지 않게 한다.
export function connectionControlKey(targetId: string, model: ProjectConnectionSummary): string {
  return `connection:${targetId}:${model.version}:${model.plan}`;
}

// 재연결 버튼을 미리 막는 이유. 서버도 같은 연결 수 상한으로 거부하지만, 확인 창까지 연 뒤에 거부를 보이지 않는다.
export function reconnectBlock(model: Pick<ProjectConnectionSummary, "plan" | "limit" | "connectedCount">): string | null {
  if (model.limit !== null && model.connectedCount >= model.limit) {
    return `No free slot. The ${planLabel(model.plan)} plan allows ${countNoun(model.limit, "connected repository", "connected repositories")}.`;
  }
  return null;
}

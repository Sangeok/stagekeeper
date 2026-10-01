import { countNoun } from "@/fsd/shared/lib/count-noun";
import { planLabel } from "@/fsd/shared/lib/entitlement-copy";

export type ProjectConnectionModel = {
  plan: "free" | "pro" | "max"; limit: number | null; version: number; connectedCount: number; writesEnabled: boolean;
  projects: { id: string; name: string; repoOwner: string; repo: string; disconnectedAt: string | null; openItems: number; openRuns: number }[];
};
export type ProjectConnectionState = { status: "success" } | { status: "stale" } | { status: "error"; reason: string };
export type ProjectConnectionAction = (input: { targetProjectId: string; expectedVersion: number }) => Promise<ProjectConnectionState>;
export const STALE_CONNECTION_MESSAGE = "Your project list changed. Review the latest connection details and try again.";
export const UNKNOWN_CONNECTION_MESSAGE = "Couldn't confirm the result. Refresh to check the latest repository connection.";
export const CONNECTION_WRITES_DISABLED_MESSAGE = "Repository connection changes are temporarily unavailable.";

export function connectionControlKey(targetId: string, model: ProjectConnectionModel): string {
  return `${targetId}:${model.version}:${model.plan}:${model.writesEnabled}`;
}

// 재연결 버튼을 미리 막는 이유. 서버도 같은 연결 수 상한으로 거부하지만, 확인 창까지 연 뒤에 거부를 보이지 않는다.
export function reconnectBlock(model: Pick<ProjectConnectionModel, "plan" | "limit" | "connectedCount" | "writesEnabled">): string | null {
  if (!model.writesEnabled) return CONNECTION_WRITES_DISABLED_MESSAGE;
  if (model.limit !== null && model.connectedCount >= model.limit) {
    return `No free slot. The ${planLabel(model.plan)} plan allows ${countNoun(model.limit, "connected repository", "connected repositories")}.`;
  }
  return null;
}

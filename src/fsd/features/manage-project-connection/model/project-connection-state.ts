export type ProjectConnectionModel = {
  plan: "free" | "pro" | "max"; limit: number | null; version: number; connectedCount: number; writesEnabled: boolean;
  projects: { id: string; name: string; repoOwner: string; repo: string; disconnectedAt: string | null; openItems: number; openRuns: number }[];
};
export type ProjectConnectionState = { status: "success" } | { status: "stale" } | { status: "error"; reason: string };
export type ProjectConnectionAction = (input: { targetProjectId: string; expectedVersion: number }) => Promise<ProjectConnectionState>;
export const STALE_CONNECTION_MESSAGE = "Your project list changed. Review the latest connection details and try again.";
export const UNKNOWN_CONNECTION_MESSAGE = "Couldn't confirm the result. Refresh to check the latest repository connection.";

export function connectionControlKey(targetId: string, model: ProjectConnectionModel): string {
  return `${targetId}:${model.version}:${model.plan}:${model.writesEnabled}`;
}

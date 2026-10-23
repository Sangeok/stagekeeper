import { buildVars, buildWorkspaceVars } from "@harness/core/templates/vars.mjs";
import type { Client } from "@harness/core/execution/client-runtime.mjs";

export type ProjectRow = { owner: string; repo: string; branch: string; name: string };
export type WorkspaceRow = { wsId: string; path: string; agent: string; verify: string[]; knowledge: string | null; readOnly: string[] };

export function serverVars(project: ProjectRow, workspaces: WorkspaceRow[], agent: string, client: Client = "claude"): Record<string, unknown> {
  const config = {
    project: { owner: project.owner, repo: project.repo, branch: project.branch, name: project.name },
    workspaces: workspaces.map((w) => ({ id: w.wsId, path: w.path, agent: w.agent, verify: w.verify, knowledge: w.knowledge ?? undefined, readOnly: w.readOnly })),
    scout: null,
    release: null,
  };
  const ws = config.workspaces.find((w) => w.agent === agent);
  return ws ? buildWorkspaceVars(config, ws, client) : buildVars(config, client);
}

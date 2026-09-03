// vars.ts — DB 행 → 템플릿 변수. 순수.
// 스텁은 플러그인이 harness.json으로 렌더하고(buildVars/buildWorkspaceVars), 단계 본문은 서버가 렌더한다.
// 둘이 같은 값을 보도록 여기서 Project·Workspace 행을 config 모양으로 되돌려 같은 함수에 넣는다.
// scout·release는 DB에 없다 — 단계 본문은 그 변수를 쓰지 않으므로(templates.test.mjs가 지킨다) 기본값으로 둔다.
import { buildVars, buildWorkspaceVars } from "@harness/core/vars.mjs";

export type ProjectRow = { owner: string; repo: string; branch: string; name: string };
export type WorkspaceRow = { wsId: string; path: string; agent: string; verify: string[]; knowledge: string | null; readOnly: string[] };

export function serverVars(project: ProjectRow, workspaces: WorkspaceRow[], agent: string): Record<string, unknown> {
  const config = {
    project: { owner: project.owner, repo: project.repo, branch: project.branch, name: project.name },
    workspaces: workspaces.map((w) => ({ id: w.wsId, path: w.path, agent: w.agent, verify: w.verify, knowledge: w.knowledge ?? undefined, readOnly: w.readOnly })),
    scout: null,
    release: null,
  };
  const ws = config.workspaces.find((w) => w.agent === agent);
  return ws ? buildWorkspaceVars(config, ws) : buildVars(config);
}

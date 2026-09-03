// 순수. /api/templates가 내려주는 집합의 규칙 — 서버(templatesFor)와 생성기의 로컬 우회로(HARNESS_TEMPLATES_DIR)가
// 같은 함수로 같은 집합을 만든다. 본문(단계)은 서버에만 남고 파일로는 스텁만 나간다(제안서 "에이전트 전달").
import { REPORT_AGENTS, limitsFor } from "./entitlement.mjs";

// 단계 제목. 이 줄 앞까지가 스텁이다 — src/server/agents/steps.ts의 파서가 같은 정규식을 쓴다(경계의 정의는 여기 하나).
export const STEP_HEADING = /^## step:(\S+)(.*)$/;
export const RUNBOOK = "CLAUDE.runbook.md";
export const RUNBOOK_FREE = "CLAUDE.runbook.free.md"; // Free 판. 키로는 나가지 않고 RUNBOOK 자리에 들어간다

// 첫 단계 제목 앞까지. 단계가 없는 본문(runbook·docs)은 그대로.
export function stubOf(body) {
  const lines = body.split(/\r?\n/);
  const first = lines.findIndex((l) => STEP_HEADING.test(l));
  return first < 0 ? body : lines.slice(0, first).join("\n").trimEnd() + "\n";
}

const agentOf = (path) => /^agents\/([^/]+)\.md$/.exec(path)?.[1] ?? null;

// rows: Template 행 { path, body } 전부(한 언어). 돌려주는 templates는 생성기가 그대로 쓰는 { path: body }.
// entitlement.agents는 이 플랜이 허용하는 **보고 에이전트**다 — 워크스페이스 dev는 harness.json이 정하고 그 수는
// workspaces 축이 막는다(roster는 첫 init 시점에 서버에 없다: project_sync가 그 뒤에 온다).
export function deliverable(rows, plan) {
  const agents = limitsFor(plan).agents;
  /** @type {Record<string, string>} */
  const templates = {};
  /** @type {string | null} */
  let freeRunbook = null;
  for (const { path, body } of rows) {
    if (path === RUNBOOK_FREE) { freeRunbook = body; continue; }
    const agent = agentOf(path);
    if (agent !== null && REPORT_AGENTS.includes(agent) && !agents.includes(agent)) continue;
    templates[path] = agent === null ? body : stubOf(body);
  }
  // Free 판 runbook이 시드되지 않았으면 일반 판이 그대로 나간다 — 시드 문제이지 사용자 오류가 아니다.
  if (plan === "free" && freeRunbook !== null && RUNBOOK in templates) templates[RUNBOOK] = freeRunbook;
  return { templates, entitlement: { plan, agents } };
}

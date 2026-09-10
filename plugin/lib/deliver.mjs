// 순수. /api/templates가 내려주는 집합의 규칙 — 서버(templatesFor)와 생성기의 로컬 우회로(HARNESS_TEMPLATES_DIR)가
// 같은 함수로 같은 집합을 만든다. 본문(단계)은 서버에만 남고 파일로는 스텁만 나간다(제안서 "에이전트 전달").
import { REPORT_AGENTS, limitsFor } from "./entitlement.mjs";

// 단계 제목. 이 줄 앞까지가 스텁이다 — src/server/agents/steps.ts의 파서가 같은 정규식을 쓴다(경계의 정의는 여기 하나).
export const STEP_HEADING = /^## step:(\S+)(.*)$/;
const RUNBOOK_FREE = "CLAUDE.runbook.free.md"; // 옛 Free 판. 파일은 지웠고 DB 행이 남아 있어도 내려보내지 않는다 — 런북은 한 판이다

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
// 런북은 한 판이다 — 플랜 차이(검증자·감사자 유무)는 그래프가 진다(pipeline.mjs defaultGraph).
export function deliverable(rows, plan) {
  const agents = limitsFor(plan).agents;
  /** @type {Record<string, string>} */
  const templates = {};
  for (const { path, body } of rows) {
    if (path === RUNBOOK_FREE) continue;
    const agent = agentOf(path);
    if (agent !== null && REPORT_AGENTS.includes(agent) && !agents.includes(agent)) continue;
    templates[path] = agent === null ? body : stubOf(body);
  }
  return { templates, entitlement: { plan, agents } };
}

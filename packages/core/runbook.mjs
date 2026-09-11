// 순수. 저장소에 심긴 런북이 현재 템플릿과 같은 판인가를 정한다.
// init이 심은 판의 해시를 서버에 보고하고(POST /api/runbook), pipeline_next의 개요가 이 판정을 싣는다.
// 해시는 **원문**에서 뽑는다 — 렌더된 결과는 {{project.name}} 때문에 프로젝트마다 달라 비교할 수 없다.
import { createHash } from "node:crypto";

export const RUNBOOK_TEMPLATE = "CLAUDE.runbook.md";

// 12자면 템플릿 한 줌을 구분하기에 충분하고, init 출력과 DB 열에 그대로 실린다.
export function runbookVersion(body) {
  return createHash("sha256").update(body).digest("hex").slice(0, 12);
}

// bodies = 지금 서버가 가진 모든 언어의 런북 원문. 언어를 따로 저장하지 않는 이유는
// "어느 언어의 현재 원문과도 안 맞으면 낡은 것"이 언어를 몰라도 성립하기 때문이다.
// stored === null(보고된 적 없음)과 bodies가 빈 경우는 둘 다 "맞다는 근거가 없다"로 본다 —
// init은 멱등하므로, 모를 때 알리는 쪽이 모르고 지나가는 쪽보다 싸다.
export function runbookIsStale(stored, bodies) {
  if (stored === null) return true;
  return !bodies.some((body) => runbookVersion(body) === stored);
}

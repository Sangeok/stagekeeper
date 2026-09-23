// 보드 시험 둘(model/briefing.test.mjs, ui/project-board-page.test.mjs)이 함께 쓰는 고정값.
// 이름이 *.test.mjs가 아니라 test:web 글롭에 잡히지 않는다.
export const ROSTER = ["web-dev", "admin-dev", "backend-dev"];
export const TODAY = new Date("2026-08-15T00:01:00Z");

export const row = ({ key = "X-0", ...fields } = {}) => ({
  agent: "web-dev",
  status: "proposed",
  reason: "Observed evidence.",
  results: [],
  proposedOn: new Date("2026-08-14T23:59:00Z"),
  backlogItem: { key },
  // 기본 그래프에서 그 상태가 서는 자리 — 게이트 여부는 상태 기계가 아니라 런의 커서가 말한다(§E.4).
  gate: { proposed: "before-plan", in_review: "before-implement" }[fields.status ?? "proposed"] ?? null,
  // 게이트에 선 자리는 노드가 없다. 일하는 자리만 노드를 갖는다 — page.tsx가 커서에서 같은 식으로 만든다.
  node: { planning: "plan", implementing: "implement" }[fields.status ?? "proposed"] ?? null,
  // 기본은 "세션이 그 일을 돌리고 있다" — 디스패치 전 상태는 그 자리에서 따로 세운다.
  dispatched: true,
  ...fields,
});

// latestBoard가 반환하는 순서와 형태: 항목별 최신 행 하나, proposedOn 내림차순.
export const BOARD = [
  row({ key: "FEAT-05", status: "proposed", reason: "pm picked it today." }),
  row({ key: "FEAT-04", status: "in_review", agent: "admin-dev", results: ["Draft plan done."] }),
  row({ key: "FEAT-06", status: "planning", agent: "admin-dev" }),
  row({ key: "FEAT-07", status: "implementing" }),
  row({ key: "FEAT-02", status: "done", results: ["Shipped the fix. Verified in prod."] }),
  row({ key: "FEAT-03", status: "on_hold", agent: "backend-dev", results: ["Owner decision — waiting on the API."] }),
  row({ key: "FEAT-01", status: "proposed", agent: "backend-dev", reason: "x".repeat(151), proposedOn: new Date("2026-08-02T12:00:00Z") }),
];

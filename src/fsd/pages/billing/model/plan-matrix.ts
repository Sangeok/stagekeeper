import { PLANS, UNLIMITED, limitsFor, type Plan } from "@harness/core/entitlement.mjs";

// 표의 줄. 축 이름과 순서를 여기서 정한다 — 값은 LIMITS에서 읽으므로 표와 코드가 어긋날 수 없다.
export type PlanRow = { label: string; values: Record<Plan, string> };

const UNLIMITED_TEXT = "Unlimited";
const count = (n: number): string => (n === UNLIMITED ? UNLIMITED_TEXT : String(n));

export function planMatrix(): PlanRow[] {
  const cell = (render: (plan: Plan) => string): Record<Plan, string> =>
    Object.fromEntries(PLANS.map((p) => [p, render(p)])) as Record<Plan, string>;
  return [
    { label: "Projects", values: cell((p) => count(limitsFor(p).projects)) },
    { label: "Workspaces per project", values: cell((p) => count(limitsFor(p).workspaces)) },
    { label: "Backlog items", values: cell((p) => count(limitsFor(p).backlog)) },
    {
      label: "History window",
      values: cell((p) => {
        const days = limitsFor(p).historyDays;
        return days === null ? UNLIMITED_TEXT : `${days} days`;
      }),
    },
    { label: "Report agents", values: cell((p) => limitsFor(p).agents.join(", ")) },
    { label: "Session approvals", values: cell((p) => (limitsFor(p).sessionApprovals ? "Yes" : "Web only")) },
    { label: "Pipeline editing", values: cell((p) => (limitsFor(p).pipelineEdit ? "Yes" : "Default only")) },
    { label: "New agent runs per 5-hour window", values: cell((p) => count(limitsFor(p).dispatches)) },
  ];
}

// 상한 문장(그리고 그 뒤의 업그레이드 안내)은 여기 두지 않는다 — capError가 이미 그 한 문장을 만든다.
export const BILLING_NOTE = "Pricing and checkout are being built. Plans are set by hand for now.";

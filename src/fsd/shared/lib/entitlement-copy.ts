// 플랜을 사람에게 보이는 말로 옮기는 한 곳. 배지·매트릭스 표·상한 안내가 여기서 같은 어휘를 쓴다.
//
// **상한 문장 자체는 여기 없다.** `capReason`/`capError`(packages/core/entitlement.mjs)가 그 단일 출처이고,
// 이유는 경계다 — 그 문장을 만드는 곳에는 서버 액션(src/fsd)뿐 아니라 MCP 도구(src/server)와 생성기(plugin)도
// 있는데, src/server는 FSD 슬라이스를 import할 수 없다. 세 층이 다 닿는 자리는 packages/core 하나뿐이라
// 문장은 거기 두고, 여기는 **화면에만 필요한 말**(플랜 이름·축 이름·무제한 표기·안내 문구)을 맡는다.
import { LIMITS, PLANS, UNLIMITED, limitsFor } from "@harness/core/entitlement.mjs";

export type PlanId = "free" | "pro" | "max";

export const PLAN_IDS = PLANS as readonly PlanId[];

const PLAN_LABEL: Record<PlanId, string> = { free: "Free", pro: "Pro", max: "Max" };
export const planLabel = (plan: PlanId): string => PLAN_LABEL[plan];

// 표의 줄. 축 이름과 순서를 여기서 정한다 — 값은 LIMITS에서 읽으므로 표와 코드가 어긋날 수 없다.
export type PlanRow = { label: string; values: Record<PlanId, string> };

const UNLIMITED_TEXT = "Unlimited";
const count = (n: number): string => (n === UNLIMITED ? UNLIMITED_TEXT : String(n));

export function planMatrix(): PlanRow[] {
  const cell = (render: (plan: PlanId) => string): Record<PlanId, string> =>
    Object.fromEntries(PLAN_IDS.map((p) => [p, render(p)])) as Record<PlanId, string>;
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
  ];
}

// 표가 LIMITS의 플랜을 하나도 빠뜨리지 않았는지 — 플랜이 늘면 여기서 걸린다.
export const PLAN_COUNT = Object.keys(LIMITS).length;

// 상한 문장(그리고 그 뒤의 업그레이드 안내)은 여기 두지 않는다 — capError가 이미 그 한 문장을 만든다.
export const BILLING_NOTE = "Pricing and checkout are being built. Plans are set by hand for now.";

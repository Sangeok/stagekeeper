import { countNoun } from "@/fsd/shared/lib/count-noun";
import { planLabel, type PlanId } from "@/fsd/shared/lib/entitlement-copy";

// /projects의 상태 문장들(product-copy.md §10). 연결 수는 새 저장소를 연결할 수 있는지를 정하므로 늘 한 문장으로 말하고,
// 사용 가능 수는 연결 수와 다를 때(다운그레이드가 남긴 Not selected)만 selectionNotice가 말한다.

const repositories = (n: number) => countNoun(n, "repository", "repositories");

export function connectionSummary({ plan, limit, connectedCount }: { plan: PlanId; limit: number | null; connectedCount: number }): { line: string; full: boolean; over: boolean } {
  const name = planLabel(plan);
  if (limit === null) return { line: `${repositories(connectedCount)} connected on the ${name} plan.`, full: false, over: false };
  if (connectedCount > limit) return { line: `${repositories(connectedCount)} connected. The ${name} plan allows ${limit}.`, full: true, over: true };
  return { line: `${connectedCount} of ${repositories(limit)} connected on the ${name} plan.`, full: connectedCount >= limit, over: false };
}

export function activityLines(openItems: number, openRuns: number): string[] {
  const lines = [];
  if (openItems > 0) lines.push(countNoun(openItems, "open item"));
  if (openRuns > 0) lines.push(countNoun(openRuns, "open agent run"));
  return lines.length > 0 ? lines : ["Nothing open"];
}

// 다운그레이드 자동 선택의 근거(packages/core availabilityBasis) → 문장 조각. 모르는 값은 근거 없이 말한다.
const BASIS: Record<string, string> = {
  "user-selection": "your earlier selection",
  "recent-agent-activity": "the most recent agent activity",
  "recent-project-sync": "the most recent sync",
  "recent-registration": "the most recent connection",
};

export function selectionNotice({ plan, limit, notSelectedCount, over, kept }: {
  plan: PlanId; limit: number | null; notSelectedCount: number; over: boolean; kept: { names: string[]; basis: string | null } | null;
}): string[] {
  const lines: string[] = [];
  if (kept) {
    const basis = kept.basis === null ? undefined : BASIS[kept.basis];
    lines.push(`After your plan changed, ${kept.names.join(", ")} stayed in use${basis ? `, chosen by ${basis}` : ""}.`);
  }
  const one = notSelectedCount === 1;
  const readOnly = `${notSelectedCount} of your connected repositories ${one ? "is" : "are"} not selected, so ${one ? "it is" : "they are"} read only.`;
  lines.push(limit === null ? readOnly : `${readOnly} The ${planLabel(plan)} plan allows ${limit} in use.`);
  const choose = "Choose Use this project to change which repositories are in use.";
  lines.push(over ? `${choose} A new repository needs a free slot, so disconnect the ones you no longer need.` : choose);
  return lines;
}

export const NOT_SELECTED_BOUNDARY = "Not selected, so read only.";

import { DEFAULT_SELECTION_POLICY } from "./pipeline.mjs";

const nonempty = value => typeof value === "string" && value.trim().length > 0 && value.length <= 3000;
export function readSelectionDecision(value) {
  if (!value || typeof value !== "object") return null;
  if (!["contextKey", "policy", "criterion", "readiness", "assignmentReason"].every(key => nonempty(value[key]))) return null;
  if (!Array.isArray(value.evidence) || !value.evidence.every(item => item && nonempty(item.key) && nonempty(item.quote))) return null;
  if (!Array.isArray(value.comparisons) || !value.comparisons.every(item => item && nonempty(item.key) && nonempty(item.reason))) return null;
  if (!Array.isArray(value.uncertainties) || !value.uncertainties.every(nonempty)) return null;
  return value;
}
export function selectionReason(decision, context, key, agent) {
  if (!readSelectionDecision(decision)) return "Assign work requires a complete selection record.";
  if (decision.contextKey !== context.contextKey) return "The candidates or selection policy changed. Read assignment_context again.";
  if (decision.policy !== context.policy) return "The selection record must name the saved selection policy.";
  for (const field of ["criterion", "readiness", "assignmentReason"]) if (!nonempty(decision[field])) return `Selection ${field} is required (up to 3000 characters).`;
  if (!Array.isArray(decision.uncertainties) || decision.uncertainties.length) return "Resolve selection uncertainties before assigning work.";
  const selected = context.candidates.find(item => item.key === key);
  if (!selected || !selected.eligible) return "This item is not eligible for assignment.";
  if (!selected.agents.includes(agent)) return "The assignee must own the item's workspace area.";
  if (!Array.isArray(decision.evidence) || !decision.evidence.length || decision.evidence.length > 20) return "Selection evidence is required.";
  if (!decision.evidence.some(evidence => evidence?.key === key)) return "Include Source evidence for the selected item.";
  for (const evidence of decision.evidence) {
    const candidate = context.candidates.find(item => item.key === evidence?.key);
    if (!candidate || !nonempty(evidence.quote) || !candidate.source.includes(evidence.quote)) return "Evidence must quote an existing candidate's Source exactly.";
  }
  if (!Array.isArray(decision.comparisons)) return "Record why the other eligible candidates were deferred.";
  const alternatives = context.candidates.filter(item => item.eligible && item.key !== key);
  if (new Set(decision.comparisons.map(item => item?.key)).size !== decision.comparisons.length
    || decision.comparisons.length !== alternatives.length
    || alternatives.some(item => !decision.comparisons.some(comparison => comparison?.key === item.key && nonempty(comparison.reason)))) return "Compare every other eligible candidate once.";
  if (context.policy === DEFAULT_SELECTION_POLICY && context.candidates.find(item => item.eligible)?.key !== key) return "The saved policy selects the oldest eligible candidate first.";
  return null;
}

export function matchingAgents(area, workspaces) {
  const normalized = area.trim().replaceAll("\\", "/").replace(/^\.\//, "").replace(/\/$/, "");
  if (!normalized || normalized.split("/").includes("..")) return [];
  const matches = workspaces.filter(workspace => {
    const path = workspace.path.replaceAll("\\", "/").replace(/^\.\//, "").replace(/\/$/, "");
    return path === "." || path === "" || normalized === path || normalized.startsWith(path + "/");
  });
  return [...new Set(matches.map(workspace => workspace.agent))];
}

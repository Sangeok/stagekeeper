import { clientRuntime } from "@harness/core/execution/client-runtime.mjs";
import { PLANS, limitsFor } from "@harness/core/plans/entitlement.mjs";
import { DEFAULT_GATES, OPT_IN_NODES, PROJECT_AGENTS, REQUIRED_NODES, STEP_KINDS, defaultGraph, dispatcherFor, nodeAllowed } from "@harness/core/pipeline/pipeline.mjs";

import { planLabel } from "@/fsd/entities/account-plan";
import { ACCEPTANCE_CHECK_LABELS, gateActionHint, gateActionLabel, gateLabel, nodeLabel } from "@/fsd/entities/pipeline";
import { installCommands } from "@/fsd/shared/config/plugin-install";

const runtime = clientRuntime("claude");
export const CLAUDE_COMMANDS = { init: runtime.init_command, watch: runtime.resume_command } as const;
export const INSTALL_COMMANDS = installCommands;
export const REPEATED_STEP_NAMES = PROJECT_AGENTS.map((agent) => nodeLabel(`${agent}#2`));

export const STEP_FACTS = STEP_KINDS.map((id) => ({
  id,
  name: nodeLabel(id),
  agent: dispatcherFor(id, "dev"),
  plans: PLANS.filter((plan) => nodeAllowed(plan, id)).map(planLabel),
  required: REQUIRED_NODES.includes(id),
  optIn: OPT_IN_NODES.includes(id),
}));

export const PLAN_FACTS = PLANS.map((plan) => {
  const limits = limitsFor(plan);
  return {
    id: plan,
    name: planLabel(plan),
    nodes: defaultGraph(plan).nodes.map(nodeLabel),
    dispatches: limits.dispatches,
    pipelineEdit: limits.pipelineEdit,
    sessionApprovals: limits.sessionApprovals,
  };
});

export const DEFAULT_GATE_FACTS = DEFAULT_GATES.map((id) => ({
  id,
  name: gateLabel(id),
  action: gateActionLabel(id),
  hint: gateActionHint(id),
}));

export const ACCEPTANCE_CHECKS = Object.entries(ACCEPTANCE_CHECK_LABELS).map(([number, name]) => ({
  number: Number(number),
  name,
}));

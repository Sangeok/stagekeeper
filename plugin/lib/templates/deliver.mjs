import { REPORT_AGENTS, limitsFor } from "../plans/entitlement.mjs";
import { clientRuntime, parseClient, runtimeEcho } from "../execution/client-runtime.mjs";
import { validateCodexBundle } from "./codex-bundle.mjs";
import { stubOf } from "./template-boundary.mjs";

export { STEP_HEADING, stubOf } from "./template-boundary.mjs";

const RUNBOOK_FREE = "CLAUDE.runbook.free.md";

const agentOf = (path) => /^agents\/([^/]+)\.md$/.exec(path)?.[1] ?? null;

export function deliverable(rows, plan, client = "claude") {
  client = parseClient(client);
  if (client === "codex") validateCodexBundle(rows, plan);
  const agents = limitsFor(plan).agents;
  /** @type {Record<string, string>} */
  const templates = {};
  for (const { path, body } of rows) {
    if (path === RUNBOOK_FREE) continue;
    if ((path === "CLAUDE.runbook.md" || path === "CODEX.runbook.md") && path !== clientRuntime(client).runbook_source) continue;
    const agent = agentOf(path);
    if (agent !== null && REPORT_AGENTS.includes(agent) && !agents.includes(agent)) continue;
    templates[path] = agent === null ? body : stubOf(body);
  }
  return { templates, entitlement: { plan, agents }, ...(client === "codex" ? { runtime: runtimeEcho() } : {}) };
}

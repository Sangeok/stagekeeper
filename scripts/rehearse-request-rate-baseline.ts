// Scripted bursts through the current MCP callbacks. Domain IO is a fixture, not production traffic.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { registerTools, type ToolDeps } from "../src/server/mcp/tools";
import { registerOwnerTools, type OwnerToolDeps } from "../src/server/mcp/owner-tools";
import { splitTemplate } from "../src/server/agents/steps";

type Call = { tool: string; args: Record<string, unknown> };
type Entry = { schema: z.ZodType; invoke: (args: never, ctx: never) => Promise<{ isError?: boolean }> };
const tools = new Map<string, Entry>();
const server = { registerTool(name: string, meta: { inputSchema: z.ZodType }, invoke: Entry["invoke"]) {
  tools.set(name, { schema: meta.inputSchema, invoke });
} } as unknown as McpServer;
const success = async () => ({ ok: true, item: {} });
registerTools(server, {
  requestLimit: async () => null, access: async () => ({ available: true, plan: "max" }), projectFor: async (slug: string) => slug,
  projectGet: async () => ({}), projectSync: success, backlogAdd: success,
  backlogList: async () => [], backlogGet: async () => ({}), boardList: async () => [], boardGet: async () => ({}),
  propose: success, transition: success, submitPlan: success, submitReport: success,
  recordValidation: success, agentNext: success, pipelineNext: success,
} as unknown as ToolDeps);
registerOwnerTools(server, { requestLimit: async () => null, access: async () => ({ available: true, plan: "max" }), owner: async () => true, gate: success } as unknown as OwnerToolDeps);

const call = (tool: string, args: Record<string, unknown> = {}): Call => ({ tool, args });
const receipt = { runId: "fixture-run", revision: 0, stepId: "fixture-step" };
const agentCall = (agent: string, outcome = false, key?: string): Call => call("agent_next", {
  agent, ...(key ? { key } : {}), ...(outcome ? { outcome: "ok", receipt } : {}),
});
function agentSequence(agent: string, file: string, steps: string[], key?: string): Call[] {
  const parsed = splitTemplate(readFileSync(new URL(`../plugin/templates/en/agents/${file}.md`, import.meta.url), "utf8"));
  for (const step of steps) assert.ok(parsed.steps.some((candidate) => candidate.id === step), `${file}: missing ${step}`);
  return [agentCall(agent, false, key), ...steps.map(() => agentCall(agent, true, key))];
}
const pm = [...agentSequence("pm", "pm", ["start", "propose", "report"]), call("backlog_list"), call("board_list", { open: true }),
  ...["K-1", "K-2"].map((key) => call("board_propose", { key, agent: "dev", reason: "Measured fixture" }))];
const scout = [...agentSequence("feature-scout", "feature-scout", ["start", "research", "write", "report"]),
  call("backlog_list", { includeRemoved: true }), call("backlog_list", { includeRemoved: true }),
  ...[1, 2, 3].map((id) => call("backlog_add", { runId: "fixture-run", title: `candidate ${id}`, area: "web", source: "fixture evidence", type: "feat" }))];
const plan = [...agentSequence("dev", "dev", ["plan"], "K-1"), call("backlog_get", { key: "K-1" }), call("plan_submit", { key: "K-1", path: "docs/plan.md", commit: "fixture" })];
const verify = [...agentSequence("plan-verifier", "plan-verifier", ["start", "read", "verify", "report"], "K-1"),
  call("board_get", { key: "K-1" }), call("validation_record", { key: "K-1", text: "pass" })];
const implement = [...agentSequence("dev", "dev", ["implement", "verify", "report"], "K-1"),
  call("board_get", { key: "K-1" }), call("report_submit", { key: "K-1", actor: "dev", path: "docs/report.md", commit: "fixture" })];
const audit = [...agentSequence("doc-auditor", "doc-auditor", ["start", "audit", "report"]), call("backlog_list")];
const gates = ["before-plan", "before-implement", "before-verify", "before-accept", "before-doc-audit"];
const item = [...plan, ...verify, ...implement, ...audit, call("pipeline_next", { key: "K-1" }),
  ...gates.flatMap((gate) => [call("gate_approve", { key: "K-1", gate, planCommit: "fixture" }), call("pipeline_next", { key: "K-1" })])];
const retries = [agentCall("dev", false, "K-1"), agentCall("dev", true, "K-1"), call("backlog_list"), call("backlog_add", { runId: "fixture-run", title: "retry", area: "web", source: "fixture", type: "feat" })];
const full = [call("project_get"), call("project_sync", { workspaces: [{ id: "app", path: ".", agent: "dev", verify: ["npm test"], knowledge: null, readOnly: [] }] }), call("pipeline_next"), ...pm, call("pipeline_next"), ...scout, ...item, ...retries];

const observations: { at: number; account: string; project: string; sequence: string }[] = [];
async function measure(sequence: string, calls: Call[], project: string): Promise<number> {
  const before = observations.length;
  for (const entry of calls) {
    const registered = tools.get(entry.tool); assert.ok(registered);
    const args = registered.schema.parse({ ...entry.args, project });
    const ctx = { http: { authInfo: { extra: { projectId: project, userId: "fixture-account", tokenId: "fixture-token" } } } };
    const result = await registered.invoke(args as never, ctx as never);
    assert.notEqual(result.isError, true, entry.tool);
    observations.push({ at: performance.now(), account: "fixture-account", project, sequence });
  }
  return observations.length - before;
}
async function main(): Promise<void> {
  const measured = {
    pm: await measure("pm", pm, "single"), scout: await measure("scout", scout, "single"),
    plan: await measure("plan", plan, "single"), verifier: await measure("verifier", verify, "single"),
    implementation: await measure("implementation", implement, "single"), audit: await measure("audit", audit, "single"),
    itemWithGates: await measure("item", item, "single"), fullWithRetries: await measure("full-with-retries", full, "single"),
  };
  observations.length = 0;
  await Promise.all(Array.from({ length: 4 }, (_, project) => Promise.all(Array.from({ length: 4 }, () => measure("concurrent-full", full, `project-${project}`)))));
  const projectPeak = Math.max(...Array.from({ length: 4 }, (_, project) => observations.filter((row) => row.project === `project-${project}`).length));
  const spanMs = Math.max(...observations.map((row) => row.at)) - Math.min(...observations.map((row) => row.at));
  assert.ok(spanMs < 10 * 60_000);
  console.log(JSON.stringify({ kind: "scripted-callback-burst", domainIO: "fixtures", measured, concurrentSessionsPerProject: 4,
    projects: 4, callbackBurstPeak: { project: projectPeak, account: observations.length },
    assumedPeakWithCli: { session: measured.fullWithRetries + 3, project: projectPeak + 4 * 3, account: observations.length + 16 * 3 }, spanMs: Math.ceil(spanMs),
    cli: { registration: 1, initialization: 2, source: "harness-init HTTP tests; separate CLI invocations" } }, null, 2));
}
main().catch(() => { console.error("Request baseline rehearsal failed"); process.exitCode = 1; });

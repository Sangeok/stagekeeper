#!/usr/bin/env node
import path from "node:path";
import { readInstalledTemplate } from "../runtime/template-installation.mjs";
import { connectionInput, verifyTemplateSupport } from "../runtime/mcp-client.mjs";

async function guard() {
  const chunks = []; let size = 0;
  for await (const chunk of process.stdin) {
    size += chunk.length;
    if (size > 65536) throw new Error("Hook input is too large");
    chunks.push(chunk);
  }
  const input = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  if (input.hook_event_name !== "PreToolUse" || !/^mcp__harness__(agent_next|pipeline_next)$/.test(input.tool_name ?? "")) return {};
  if (typeof input.cwd !== "string" || !path.isAbsolute(input.cwd) || !input.tool_input || typeof input.tool_input !== "object" || Array.isArray(input.tool_input)) throw new Error("Invalid hook context");
  const args = { ...input.tool_input };
  const { installation, config } = readInstalledTemplate(input.cwd, "claude", input.tool_name.endsWith("__agent_next") ? args.agent : undefined);
  if (args.project != null && args.project !== config.project.slug || args.client != null && args.client !== "claude") throw new Error("Hook project or client differs from the installed checkout");
  await verifyTemplateSupport(connectionInput(input.cwd, { client: "claude" }));
  for (const field of ["entry", "execution", "agentRunId", "receipt"]) if (args[field] === null) delete args[field];
  return { hookSpecificOutput: { hookEventName: "PreToolUse", updatedInput: {
    ...args, client: "claude", installation, ...(config.project.slug ? { project: config.project.slug } : {}),
  } } };
}

try { console.log(JSON.stringify(await guard())); }
catch {
  console.log(JSON.stringify({ hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny",
    permissionDecisionReason: "Template installation is unavailable, pending, modified or belongs to another checkout. Preserve files and run init before continuing." } }));
}

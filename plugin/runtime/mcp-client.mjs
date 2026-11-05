import { randomUUID, createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseHarnessConfig } from "../lib/configuration/harness-config.mjs";
import { parseBearer } from "../lib/tokens/token.mjs";
import { parseClient, RUNTIME_PROTOCOL } from "../lib/execution/client-runtime.mjs";
import { parseToolResponse } from "../lib/execution/watch.mjs";
import { isRunbookVersion, codexRunbookVersion } from "../lib/templates/runbook.mjs";
import { validateCodexBundle } from "../lib/templates/codex-bundle.mjs";

import { installationFromMetadata, readInstalledTemplate } from "./template-installation.mjs";
import { TEMPLATE_PROTOCOL, compatibleInstallation } from "../lib/templates/release-manifest.mjs";

export function serverUrl(value) {
  const url = new URL(value);
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error("Invalid HARNESS_SERVER URL");
  url.pathname = url.pathname.replace(/\/+$/, "").replace(/\/api\/mcp(?:\/owner)?$/, "");
  return url.href.replace(/\/+$/, "");
}

export function connectionInput(root, options = {}) {
  const configText = readFileSync(join(root, "harness.json"), "utf8"), config = parseHarnessConfig(configText);
  const token = process.env.HARNESS_TOKEN;
  if (!parseBearer(`Bearer ${token}`, "agent") && !parseBearer(`Bearer ${token}`, "user")) throw new Error("HARNESS_TOKEN must be an agent or user token");
  if (token.startsWith("hu_") && !config.project.slug) throw new Error("User token requires project.slug; run the client init skill");
  const client = parseClient(options.client), server = serverUrl(options.server ?? process.env.HARNESS_SERVER);
  const hash = value => createHash("sha256").update(value).digest("hex");
  let runbook = null;
  if (client === "codex") {
    const metadata = JSON.parse(readFileSync(join(root, "docs/harness/codex-package.json"), "utf8"));
    if (metadata.client !== client || metadata.protocol !== RUNTIME_PROTOCOL || !isRunbookVersion(metadata.runbook)) throw new Error("Unsupported Codex installation; run $harness-init");
    runbook = metadata.runbook;
  }
  const { installation } = readInstalledTemplate(root, client);
  return { config, token, server, client, runbook, installation,
    binding: { root, server, project: config.project.slug, configHash: hash(configText), tokenHash: hash(token) } };
}

export async function mcpRequest(input, method, params, signal) {
  const id = randomUUID();
  const timeout = AbortSignal.timeout(20000), combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
  const response = await fetch(`${input.server}/api/mcp`, { method: "POST", redirect: "manual", signal: combined,
    headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream", Authorization: `Bearer ${input.token}` },
    body: JSON.stringify({ jsonrpc: "2.0", id, method, params }) });
  if (!response.ok) { await response.body?.cancel(); throw new Error(`MCP request refused (HTTP ${response.status}); stop and resolve authentication, cap or server error`); }
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Empty MCP response");
  const chunks = []; let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if ((size += value.length) > 1024 * 1024) throw new Error("MCP response limit exceeded");
      chunks.push(value);
    }
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
  return { id, body: new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks)), contentType: response.headers.get("content-type") };
}

export class McpDomainError extends Error {
  constructor(body) {
    super("The server refused the role request.");
    this.name = "McpDomainError";
    this.body = Object.freeze(body);
  }
}

export class McpInputError extends Error {
  constructor(kind = "schema", limit = null) {
    const message = kind === "receipt"
      ? "Outcome receipt mismatch. Reread agent_next without outcome, use its current receipt unchanged, and redo affected checks without changing role, key or entry."
      : kind === "note" && Number.isInteger(limit) && limit >= 0 && limit <= 10000
        ? `agent_next note must be a string of at most ${limit} characters. Keep detailed evidence in the report, then retry with the same current receipt.`
        : "Invalid MCP tool arguments. Correct the input to match this tool's schema; keep the current role, project, key, entry and receipt. No successful outcome is claimed.";
    super(message); this.name = "McpInputError"; this.kind = ["receipt", "note"].includes(kind) ? kind : "schema";
  }
}

function safeDomainFailure(error, token) {
  const reason = error.reason?.trim();
  if (!reason || reason.length > 1000 || (token && reason.includes(token))
    || /[<>\x00-\x1f]|\bBearer\b|\b(?:hs_|hu_|ho_)[A-Za-z0-9_-]+|Authorization|\bat\s+\S+\s*\(/i.test(reason)) return null;
  return { error: reason,
    ...(error.domainCode === "USAGE_LIMIT_REACHED" ? { code: error.domainCode, resetAt: error.resetAt } : {}),
    ...(error.domainCode === "RATE_LIMITED" ? { code: error.domainCode, retryAfterSec: error.retryAfterSec } : {}) };
}

export async function callTool(input, name, args = {}, signal) {
  const scoped = { ...args, ...(input.config.project.slug ? { project: input.config.project.slug } : {}) };
  if (["agent_next", "pipeline_next"].includes(name)) {
    scoped.client = input.client;
    scoped.installation = readInstalledTemplate(input.binding.root, input.client, name === "agent_next" ? scoped.agent : undefined).installation;
  }
  if (name === "pipeline_next" && input.runbook) scoped.runbook = input.runbook;
  const response = await mcpRequest(input, "tools/call", { name, arguments: scoped }, signal);
  const valueKind = ["backlog_list", "board_list"].includes(name) ? "object-list" : "object";
  const parsed = parseToolResponse(response.contentType, response.body, response.id, valueKind);
  if (!parsed.ok) {
    if (parsed.error.code === "invalid-arguments") throw new McpInputError();
    const body = parsed.error.code === "access-refused" ? safeDomainFailure(parsed.error, input.token) : null;
    if (body) throw new McpDomainError(body);
    throw new Error(`MCP ${name} failed (${parsed.error.code}); stop; use ${input.client === "codex" ? "$harness-init" : "/harness:init"} for connection recovery`);
  }
  if (input.client === "codex" && ["agent_next", "pipeline_next"].includes(name)
    && (parsed.value?.runtime?.client !== "codex" || parsed.value.runtime.protocol !== RUNTIME_PROTOCOL)) throw new Error("Unsupported Codex server runtime; no further calls allowed");
  if (["agent_next", "pipeline_next"].includes(name) && parsed.value?.templateProtocol !== TEMPLATE_PROTOCOL) throw new Error("Unsupported template server protocol; no further calls allowed");
  if (["agent_next", "pipeline_next"].includes(name)) readInstalledTemplate(input.binding.root, input.client);
  return parsed.value;
}

export async function verifyProject(input) {
  await verifyTemplateSupport(input);
  const identity = await callTool(input, "project_get");
  const project = input.config.project;
  if (identity?.available !== true || identity.owner?.toLowerCase() !== project.owner.toLowerCase()
    || identity.repo?.toLowerCase() !== project.repo.toLowerCase() || (project.slug && identity.slug !== project.slug)) throw new Error("Token/project identity mismatch or unavailable project");
  return identity;
}

export async function verifyTemplateSupport(input, signal) {
  const { installation } = readInstalledTemplate(input.binding.root, input.client);
  const url = new URL(`${input.server}/api/templates`);
  url.searchParams.set("client", input.client); url.searchParams.set("lang", installation.language);
  url.searchParams.set("release", installation.releaseId); url.searchParams.set("templateProtocol", TEMPLATE_PROTOCOL);
  if (input.config.project.slug) url.searchParams.set("project", input.config.project.slug);
  const timeout = AbortSignal.timeout(15000);
  const response = await fetch(url, { redirect: "manual", signal: signal ? AbortSignal.any([signal, timeout]) : timeout, headers: { Authorization: `Bearer ${input.token}` } });
  if (!response.ok) { await response.body?.cancel(); throw new Error("Template installation support check refused; resolve access or init before continuing"); }
  const body = await response.json();
  const selected = installationFromMetadata(body?.templateRelease);
  if (selected.releaseId !== installation.releaseId || !compatibleInstallation(installation, selected)) throw new Error("Installed release is not supported by this server and current plan");
  return body;
}

export async function verifyCodexSupport(input) {
  const url = new URL(`${input.server}/api/templates`);
  const { installation } = readInstalledTemplate(input.binding.root, "codex");
  url.searchParams.set("client", "codex"); url.searchParams.set("lang", installation.language);
  url.searchParams.set("release", installation.releaseId); url.searchParams.set("templateProtocol", TEMPLATE_PROTOCOL);
  if (input.config.project.slug) url.searchParams.set("project", input.config.project.slug);
  const response = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(20000), headers: { Authorization: `Bearer ${input.token}` } });
  if (!response.ok) throw new Error("Codex bundle preflight refused");
  const bundle = await response.json();
  if (bundle.templateRelease?.id !== installation.releaseId || !compatibleInstallation(installation, bundle.templateRelease ?? {})) throw new Error("Codex installation is incompatible with this release and current plan");
  if (bundle.runtime?.client !== "codex" || bundle.runtime.protocol !== RUNTIME_PROTOCOL) throw new Error("Unsupported Codex server runtime");
  validateCodexBundle(Object.entries(bundle.templates ?? {}).map(([path, body]) => ({ path, body })), bundle.entitlement?.plan);
  if (codexRunbookVersion(bundle.templates["CODEX.runbook.md"]) !== input.runbook) throw new Error("Codex runbook is stale; run $harness-init");
  return bundle;
}

export async function listTools(input) {
  const { body, contentType, id } = await mcpRequest(input, "tools/list", {});
  const messages = contentType?.includes("text/event-stream")
    ? body.split(/\r?\n\r?\n/).map(event => event.split(/\r?\n/).filter(line => line.startsWith("data:")).map(line => line.slice(5).trimStart()).join("\n")).filter(Boolean).map(text => JSON.parse(text))
    : [JSON.parse(body)];
  const message = messages.find(value => value.id === id);
  if (message?.error || !Array.isArray(message?.result?.tools)) throw new Error("Invalid MCP tool inventory");
  return message.result.tools;
}

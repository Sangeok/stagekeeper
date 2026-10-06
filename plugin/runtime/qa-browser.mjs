import { randomUUID } from "node:crypto";
import { lstat, readFile, realpath } from "node:fs/promises";
import path from "node:path";
import { QA_BROWSER_TOOLS, parseQaConfig } from "../lib/qa.mjs";

// Never forward Stagekeeper credentials or reuse the owner's browser profile.
// The owner starts a dedicated --isolated MCP process with disposable test data.
export async function createQaBrowser(config, fetcher = fetch) {
  const qa = parseQaConfig(config);
  if (!qa) throw new Error("Explicit QA test environment required");
  let session = null, closed = false, navigated = false;
  const observed = new Set();
  const request = async (method, params, signal) => {
    if (closed) throw new Error("QA browser closed");
    const id = randomUUID(), response = await fetcher(qa.mcpUrl, { method: "POST", redirect: "error", signal: AbortSignal.any([AbortSignal.timeout(30000), ...(signal ? [signal] : [])]),
      headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream", "MCP-Protocol-Version": "2025-03-26", ...(session ? { "Mcp-Session-Id": session } : {}) }, body: JSON.stringify({ jsonrpc: "2.0", id, method, params }) });
    if (!response.ok) { await response.body?.cancel(); throw new Error(`QA MCP unavailable (HTTP ${response.status})`); }
    session ??= response.headers.get("mcp-session-id");
    const reader = response.body?.getReader();
    if (!reader) throw new Error("Empty QA MCP response");
    const chunks = []; let bytes = 0;
    try { for (;;) { const { done, value } = await reader.read(); if (done) break; if ((bytes += value.length) > 8 * 1024 * 1024) throw new Error("QA MCP response too large"); chunks.push(value); } }
    finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
    const body = new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks));
    const messages = response.headers.get("content-type")?.includes("text/event-stream")
      ? body.split(/\r?\n\r?\n/).map(event => event.split(/\r?\n/).filter(line => line.startsWith("data:")).map(line => line.slice(5).trimStart()).join("\n")).filter(Boolean).map(value => JSON.parse(value)) : [JSON.parse(body)];
    const reply = messages.find(message => message.id === id);
    if (!reply || reply.error) throw new Error("QA MCP request refused");
    return reply.result;
  };
  const pageOrigin = result => {
    const content = (result.content ?? []).filter(item => item.type === "text").map(item => item.text).join("\n");
    const url = /^- Page URL: (.+)$/m.exec(content)?.[1];
    if (!url || new URL(url).origin !== new URL(qa.baseUrl).origin) { observed.clear(); throw new Error("QA page left the configured test origin; stop and report blocked"); }
  };
  const inlineSnapshots = async result => {
    const content = [];
    for (const item of result.content ?? []) {
      content.push(item);
      if (item.type !== "text") continue;
      for (const match of item.text.matchAll(/^- \[Snapshot\]\(([^)]+)\)/gm)) {
        if (!qa.artifactsDir) throw new Error("QA file snapshots require qa.artifactsDir matching the dedicated MCP --output-dir");
        const filename = path.posix.basename(match[1].replaceAll("\\", "/"));
        if (!/^page-[0-9][A-Za-z0-9.-]*\.yml$/.test(filename)) throw new Error("Unexpected QA snapshot filename");
        const root = await realpath(qa.artifactsDir), file = path.join(root, filename);
        if ((await lstat(qa.artifactsDir)).isSymbolicLink()) throw new Error("QA artifact directory symlink refused");
        const stat = await lstat(file), physical = await realpath(file);
        if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 256 * 1024 || path.relative(root, physical) !== filename) throw new Error("QA snapshot escaped the designated output directory or exceeded its bound");
        content.push({ type: "text", text: `### Observed snapshot\n${await readFile(file, "utf8")}` });
      }
    }
    return { ...result, content };
  };
  const close = async () => {
    if (closed) return;
    try { if (navigated) await request("tools/call", { name: "browser_close", arguments: {} }); }
    finally { closed = true; if (session) { const response = await fetcher(qa.mcpUrl, { method: "DELETE", redirect: "error", headers: { "Mcp-Session-Id": session, "MCP-Protocol-Version": "2025-03-26" }, signal: AbortSignal.timeout(10000) }); await response.body?.cancel(); } }
  };
  try {
    await request("initialize", { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "stagekeeper-qa", version: "1" } });
    const response = await fetcher(qa.mcpUrl, { method: "POST", redirect: "error", signal: AbortSignal.timeout(10000), headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream", "MCP-Protocol-Version": "2025-03-26", ...(session ? { "Mcp-Session-Id": session } : {}) }, body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) });
    await response.body?.cancel(); if (!response.ok) throw new Error("QA MCP initialization refused");
    const inventory = await request("tools/list", {});
    const tools = (inventory.tools ?? []).filter(tool => QA_BROWSER_TOOLS.includes(tool.name));
    if (tools.length !== QA_BROWSER_TOOLS.length || new Set(tools.map(tool => tool.name)).size !== tools.length) throw new Error("Playwright MCP QA tool inventory incomplete");
    return { tools, close,
      call: async (name, args = {}, signal) => {
        if (!QA_BROWSER_TOOLS.includes(name)) throw new Error("QA browser tool refused");
        if (args.filename !== undefined) throw new Error("QA artifacts use the MCP output directory, never a model-selected path");
        if (name === "browser_navigate") {
          const url = new URL(args.url);
          if (url.username || url.password || url.origin !== new URL(qa.baseUrl).origin) throw new Error("QA navigation outside test origin refused");
        } else {
          if (!navigated) throw new Error("QA must first navigate to its test environment");
          const snapshot = await inlineSnapshots(await request("tools/call", { name: "browser_snapshot", arguments: {} }, signal));
          if (snapshot.isError) { observed.clear(); throw new Error("QA browser snapshot failed"); }
          pageOrigin(snapshot);
        }
        const result = await inlineSnapshots(await request("tools/call", { name, arguments: args }, signal));
        if (!Array.isArray(result.content)) throw new Error("Malformed QA browser result");
        if (result.isError) { observed.clear(); return { mcpResult: result }; }
        if (name === "browser_navigate" || name === "browser_snapshot") pageOrigin(result);
        else {
          const snapshot = await inlineSnapshots(await request("tools/call", { name: "browser_snapshot", arguments: {} }, signal));
          if (snapshot.isError) { observed.clear(); throw new Error("QA browser snapshot failed after action"); }
          pageOrigin(snapshot);
        }
        if (name === "browser_navigate") navigated = true;
        observed.add(name);
        return { mcpResult: result };
      },
      verified: () => ["browser_navigate", "browser_snapshot", "browser_console_messages", "browser_network_requests"].every(name => observed.has(name)),
    };
  } catch (error) { await close().catch(() => {}); throw error; }
}

export function withQaBrowser(files, browser) {
  return { tools: [...(files?.tools ?? []), ...browser.tools], call: (name, args, signal) => QA_BROWSER_TOOLS.includes(name) ? browser.call(name, args, signal) : files.call(name, args, signal),
    qaVerified: browser.verified, close: async () => { try { await browser.close(); } finally { await files?.close(); } } };
}

import { createHash } from "node:crypto";
import { COMMON_DOCS, parseClient } from "./client-runtime.mjs";

export function hashOf(text) { return createHash("sha256").update(String(text).replace(/\r\n/g, "\n")).digest("hex").slice(0, 16); }

export function planWrites({ targets, existing, lock, adopt }) {
  const out = { write: [], skipModified: [], refuse: [] };
  for (const path of Object.keys(targets)) {
    const cur = existing[path] ?? null;
    if (cur === null) { out.write.push(path); continue; }
    const locked = lock?.files?.[path];
    if (locked !== undefined) { (hashOf(cur) === locked.hash ? out.write : out.skipModified).push(path); continue; }
    (adopt ? out.write : out.refuse).push(path);
  }
  return out;
}

export function mergeClientLock(previous, targets, writes, client = "claude") {
  client = parseClient(client);
  const shared = new Set(COMMON_DOCS.map(file => file));
  const owns = path => shared.has(path) || (client === "claude" ? path.startsWith(".claude/agents/") : path.startsWith(".codex/agents/") || ["docs/harness/codex-runbook.md", "docs/harness/codex-package.json"].includes(path));
  const files = Object.fromEntries(Object.entries(previous?.files ?? {}).filter(([path]) => !owns(path)));
  for (const path of writes.write) files[path] = { template: targets[path].template, hash: hashOf(targets[path].content) };
  for (const path of writes.skipModified) files[path] = previous.files[path];
  return { version: 1, files };
}

import { createHash } from "node:crypto";
import { COMMON_DOCS, parseClient } from "./client-runtime.mjs";

// CRLF→LF 정규화 후 해시한다 — 생성물은 LF로 쓰지만 Windows 체크아웃은 CRLF로 돌려주므로,
// 정규화하지 않으면 손대지 않은 파일이 "사용자가 고쳤다"로 오분류된다.
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

export function buildLock(targets) {
  const files = {};
  for (const [path, t] of Object.entries(targets)) files[path] = { template: t.template, hash: hashOf(t.content) };
  return { version: 1, files };
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

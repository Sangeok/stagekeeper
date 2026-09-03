#!/usr/bin/env node
// harness.json을 읽어 에이전트 정의·규약 문서·런북 절·.mcp.json을 사용자 저장소에 물질화한다. 보드·백로그는 서비스 DB에 있으므로 만들지 않는다.
// 에이전트 파일은 스텁이다 — 단계 본문은 서버에만 있고 agent_next가 한 번에 하나씩 준다. 무엇이 내려오는지는 플랜이 정한다.
// 사용: node harness-init.mjs [--config harness.json] [--root .] [--server <url>] [--adopt] [--dry-run]
// 종료코드: 0 완료 · 1 설정 오류 · 3 refuse(기존 파일과 충돌, 아무것도 쓰지 않음)
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { parseHarnessConfig } from "../lib/config.mjs";
import { deliverable } from "../lib/deliver.mjs";
import { capReason, isPlan, withinLimit } from "../lib/entitlement.mjs";
import { buildLock, planWrites } from "../lib/manifest.mjs";
import { renderTemplate } from "../lib/render.mjs";
import { buildVars, buildWorkspaceVars } from "../lib/vars.mjs";

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const ROOT = opt("--root", ".");
const CONFIG = join(ROOT, opt("--config", "harness.json"));
const SERVER = (opt("--server", process.env.HARNESS_SERVER) ?? "").replace(/\/$/, "");
const ADOPT = args.includes("--adopt");
const DRY = args.includes("--dry-run");
// 템플릿은 플러그인에 동봉하지 않는다 — 서버가 인증된 요청에만 내려준다.
// HARNESS_TEMPLATES_DIR는 개발·테스트에서 로컬 원본을 쓰기 위한 우회로다. 그때 플랜은 HARNESS_PLAN(기본 max)이 정한다 —
// 서버가 없으니 무엇을 내려줄지도 여기서 같은 규칙(lib/deliver.mjs)으로 정한다.
const TPL_DIR = process.env.HARNESS_TEMPLATES_DIR;
const LOCAL_PLAN = process.env.HARNESS_PLAN ?? "max";
const RUNBOOK_START = "<!-- harness:runbook:start -->", RUNBOOK_END = "<!-- harness:runbook:end -->";

let config;
try { config = parseHarnessConfig(readFileSync(CONFIG, "utf8")); }
catch (e) { console.log(`Config error: ${e.message}`); process.exit(1); }

// 서비스 URL에 기본값을 두지 않는다 — 잘못된 호스트가 저장소에 박히면 조용히 다른 서비스를 가리킨다.
if (!SERVER) { console.log("Server URL required: pass --server <url> or set HARNESS_SERVER (shown on the web Tokens page)"); process.exit(1); }

const lang = config.language;

// templates: rel → 본문(에이전트는 스텁, 플랜 밖 에이전트는 없음). entitlement: { plan, agents } — 이 플랜이 허용하는 보고 에이전트.
let templates, entitlement;
if (TPL_DIR) {
  if (!isPlan(LOCAL_PLAN)) { console.log(`Config error: HARNESS_PLAN must be one of free, pro, max (got ${LOCAL_PLAN})`); process.exit(1); }
  const dir = join(TPL_DIR, lang);
  const rows = readdirSync(dir, { recursive: true, withFileTypes: true }).filter((d) => d.isFile())
    .map((d) => { const full = join(d.parentPath ?? d.path, d.name); return { path: relative(dir, full).split("\\").join("/"), body: readFileSync(full, "utf8") }; });
  ({ templates, entitlement } = deliverable(rows, LOCAL_PLAN));
} else {
  const token = process.env.HARNESS_TOKEN;
  if (!token) { console.log("HARNESS_TOKEN required: issue one on the web Tokens page and export it in this shell"); process.exit(1); }
  const url = `${SERVER}/api/templates?lang=${encodeURIComponent(lang)}`;
  let res;
  try { res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } }); }
  catch (e) { console.log(`Cannot reach ${url}: ${e.message}`); process.exit(1); }
  if (!res.ok) {
    const reason = await res.json().then((b) => b.error).catch(() => res.statusText);
    console.log(`Templates unavailable (${res.status}): ${reason}`);
    process.exit(1);
  }
  const body = await res.json().catch(() => null);
  // Phase 4 이전 서버는 { <rel>: <body> } 평면 맵을 줬다 — 그 서버가 주는 것은 스텁이 아니라 원문이므로 받지 않는다.
  if (!body || typeof body.templates !== "object" || body.templates === null || !body.entitlement) {
    console.log("Unexpected /api/templates response (no `templates` key): plugin and server are out of step — update the harness plugin.");
    process.exit(1);
  }
  ({ templates, entitlement } = body);
}
const { plan, agents } = entitlement;
console.log(`plan: ${plan}`);

// 워크스페이스 상한은 서버(project_sync)가 지키지만, 파일을 다 써 놓고 거절당하면 반쯤 초기화된 저장소가 남는다 — 여기서 먼저 막는다.
if (!withinLimit(plan, "workspaces", config.workspaces.length)) {
  console.log(`${capReason(plan, "workspaces")}: harness.json has ${config.workspaces.length} workspaces. project_sync would refuse — drop workspaces or upgrade the plan on the web.`);
  process.exit(1);
}

// rel은 언어를 뺀 경로다 — 서버는 lang으로 갈라 주고, 로컬 원본은 <dir>/<lang>/<rel>에 있다.
const tpl = (rel) => {
  const body = templates[rel];
  if (body === undefined) { console.log(`Template missing${TPL_DIR ? "" : " on server"}: ${lang}/${rel}`); process.exit(1); }
  return body;
};
const vars = buildVars(config);
const targets = {};
const add = (path, template, content) => { targets[path] = { template, content }; };

for (const d of ["plans/README.md", "plans/template.md", "plans/verification-paths.md", "agents/README.md"])
  add(`docs/${d}`, `${lang}/docs/${d}`, renderTemplate(tpl(`docs/${d}`), vars));
// 보고 에이전트는 플랜이 허용하는 것만 — 플랜 밖 에이전트는 서버가 내려주지도 않는다. 이미 디스크에 있는 옛 파일은 건드리지 않고 lock에서만 빠진다.
const report = (a) => {
  if (agents.includes(a)) add(`.claude/agents/${a}.md`, `${lang}/agents/${a}.md`, renderTemplate(tpl(`agents/${a}.md`), vars));
  else console.log(`skip(plan): .claude/agents/${a}.md (not on the ${plan} plan)`);
};
for (const a of ["pm", "plan-verifier", "doc-auditor"]) report(a);
if (config.scout) report("feature-scout");
for (const ws of config.workspaces)
  add(`.claude/agents/${ws.agent}.md`, `${lang}/agents/dev.md`, renderTemplate(tpl("agents/dev.md"), buildWorkspaceVars(config, ws)));

const existing = {};
for (const p of Object.keys(targets)) existing[p] = existsSync(join(ROOT, p)) ? readFileSync(join(ROOT, p), "utf8") : null;
const lockPath = join(ROOT, "harness.lock.json");
const lock = existsSync(lockPath) ? JSON.parse(readFileSync(lockPath, "utf8")) : null;
const writes = planWrites({ targets, existing, lock, adopt: ADOPT });

for (const p of writes.refuse) console.log(`refuse: ${p}`);
for (const p of writes.skipModified) console.log(`skip(modified): ${p}`);
if (writes.refuse.length) { console.log("Conflicts with existing files. Rerun with --adopt to take them over, or move them out of the way."); process.exit(3); }

const write = (p, content) => { if (DRY) return; mkdirSync(dirname(join(ROOT, p)), { recursive: true }); writeFileSync(join(ROOT, p), content); };
for (const p of writes.write) { console.log(`write: ${p}`); write(p, targets[p].content); }

// 런북: 마커 사이 절만 우리 것. 병합 파일이라 lock에 넣지 않는다. Free 플랜이면 서버가 이 키에 free 변형을 담아 준다.
const runbookBlock = `${RUNBOOK_START}\n${renderTemplate(tpl("CLAUDE.runbook.md"), vars)}\n${RUNBOOK_END}`;
const runbookPath = join(ROOT, "CLAUDE.md");
let runbook = existsSync(runbookPath) ? readFileSync(runbookPath, "utf8") : "";
const s = runbook.indexOf(RUNBOOK_START), e = runbook.indexOf(RUNBOOK_END);
runbook = s >= 0 && e > s ? runbook.slice(0, s) + runbookBlock + runbook.slice(e + RUNBOOK_END.length)
                          : (runbook ? runbook.replace(/\s*$/, "\n\n") : "") + runbookBlock + "\n";
console.log(`write: CLAUDE.md (runbook ${s >= 0 ? "replaced" : "inserted"})`);
write("CLAUDE.md", runbook);

// .mcp.json: harness 서버 항목만 병합 — 사용자의 다른 MCP 서버를 보존한다. 토큰은 환경변수 참조로만.
const mcpPath = join(ROOT, ".mcp.json");
const mcp = existsSync(mcpPath) ? JSON.parse(readFileSync(mcpPath, "utf8")) : {};
mcp.mcpServers = { ...(mcp.mcpServers ?? {}), harness: { type: "http", url: `${SERVER}/api/mcp`, headers: { Authorization: "Bearer ${HARNESS_TOKEN}" } } };
console.log(`write: .mcp.json (harness ${existsSync(mcpPath) ? "merged" : "created"})`);
write(".mcp.json", JSON.stringify(mcp, null, 2) + "\n");

const nextLock = buildLock(Object.fromEntries(writes.write.map((p) => [p, targets[p]])));
for (const p of writes.skipModified) nextLock.files[p] = lock.files[p];
write("harness.lock.json", JSON.stringify(nextLock, null, 2) + "\n");
console.log(`done: write ${writes.write.length} · skip ${writes.skipModified.length}`);

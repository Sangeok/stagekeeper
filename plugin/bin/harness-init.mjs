#!/usr/bin/env node
// harness.json을 읽어 에이전트 정의·규약 문서·런북 절·.mcp.json을 사용자 저장소에 물질화한다. 보드·백로그는 서비스 DB에 있으므로 만들지 않는다.
// 사용: node harness-init.mjs [--config harness.json] [--root .] [--server <url>] [--adopt] [--dry-run]
// 종료코드: 0 완료 · 1 설정 오류 · 3 refuse(기존 파일과 충돌, 아무것도 쓰지 않음)
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { parseHarnessConfig } from "../lib/config.mjs";
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
// HARNESS_TEMPLATES_DIR는 개발·테스트에서 로컬 원본을 쓰기 위한 우회로다.
const TPL_DIR = process.env.HARNESS_TEMPLATES_DIR;
const RUNBOOK_START = "<!-- harness:runbook:start -->", RUNBOOK_END = "<!-- harness:runbook:end -->";

let config;
try { config = parseHarnessConfig(readFileSync(CONFIG, "utf8")); }
catch (e) { console.log(`Config error: ${e.message}`); process.exit(1); }

// 서비스 URL에 기본값을 두지 않는다 — 잘못된 호스트가 저장소에 박히면 조용히 다른 서비스를 가리킨다.
if (!SERVER) { console.log("Server URL required: pass --server <url> or set HARNESS_SERVER (shown on the web Tokens page)"); process.exit(1); }

const lang = config.language;

let fetched = null;
if (!TPL_DIR) {
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
  fetched = await res.json();
}

// rel은 언어를 뺀 경로다 — 서버는 lang으로 갈라 주고, 로컬 원본은 <dir>/<lang>/<rel>에 있다.
const tpl = (rel) => {
  if (TPL_DIR) return readFileSync(join(TPL_DIR, lang, rel), "utf8");
  const body = fetched[rel];
  if (body === undefined) { console.log(`Template missing on server: ${lang}/${rel}`); process.exit(1); }
  return body;
};
const vars = buildVars(config);
const targets = {};
const add = (path, template, content) => { targets[path] = { template, content }; };

for (const d of ["plans/README.md", "plans/template.md", "plans/verification-paths.md", "agents/README.md"])
  add(`docs/${d}`, `${lang}/docs/${d}`, renderTemplate(tpl(`docs/${d}`), vars));
for (const a of ["pm", "plan-verifier", "doc-auditor"])
  add(`.claude/agents/${a}.md`, `${lang}/agents/${a}.md`, renderTemplate(tpl(`agents/${a}.md`), vars));
if (config.scout) add(".claude/agents/feature-scout.md", `${lang}/agents/feature-scout.md`, renderTemplate(tpl("agents/feature-scout.md"), vars));
for (const ws of config.workspaces)
  add(`.claude/agents/${ws.agent}.md`, `${lang}/agents/dev.md`, renderTemplate(tpl("agents/dev.md"), buildWorkspaceVars(config, ws)));

const existing = {};
for (const p of Object.keys(targets)) existing[p] = existsSync(join(ROOT, p)) ? readFileSync(join(ROOT, p), "utf8") : null;
const lockPath = join(ROOT, "harness.lock.json");
const lock = existsSync(lockPath) ? JSON.parse(readFileSync(lockPath, "utf8")) : null;
const plan = planWrites({ targets, existing, lock, adopt: ADOPT });

for (const p of plan.refuse) console.log(`refuse: ${p}`);
for (const p of plan.skipModified) console.log(`skip(modified): ${p}`);
if (plan.refuse.length) { console.log("Conflicts with existing files. Rerun with --adopt to take them over, or move them out of the way."); process.exit(3); }

const write = (p, content) => { if (DRY) return; mkdirSync(dirname(join(ROOT, p)), { recursive: true }); writeFileSync(join(ROOT, p), content); };
for (const p of plan.write) { console.log(`write: ${p}`); write(p, targets[p].content); }

// 런북: 마커 사이 절만 우리 것. 병합 파일이라 lock에 넣지 않는다.
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

const nextLock = buildLock(Object.fromEntries(plan.write.map((p) => [p, targets[p]])));
for (const p of plan.skipModified) nextLock.files[p] = lock.files[p];
write("harness.lock.json", JSON.stringify(nextLock, null, 2) + "\n");
console.log(`done: write ${plan.write.length} · skip ${plan.skipModified.length}`);

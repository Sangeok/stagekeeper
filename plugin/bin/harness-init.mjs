#!/usr/bin/env node
// harness.json을 읽어 에이전트 정의·규약 문서·런북 절·.mcp.json을 사용자 저장소에 물질화한다. 보드·백로그는 서비스 DB에 있으므로 만들지 않는다.
// 에이전트 파일은 스텁이다 — 단계 본문은 서버에만 있고 agent_next가 한 번에 하나씩 준다. 무엇이 내려오는지는 플랜이 정한다.
// 사용: node harness-init.mjs [--config harness.json] [--root .] [--server <url>] [--adopt] [--owner] [--dry-run] [--print-project]
// 종료코드: 0 완료 · 1 설정 오류 · 3 refuse(기존 파일과 충돌, 아무것도 쓰지 않음)
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { parseHarnessConfig } from "../lib/config.mjs";
import { parseRepoUrl } from "../lib/repo-url.mjs";
import { deliverable } from "../lib/deliver.mjs";
import { REPORT_AGENTS, capReason, isPlan, withinLimit } from "../lib/entitlement.mjs";
import { buildLock, planWrites } from "../lib/manifest.mjs";
import { renderTemplate } from "../lib/render.mjs";
import { runbookVersion } from "../lib/runbook.mjs";
import { buildReportTable, buildVars, buildWorkspaceVars, templateDescription } from "../lib/vars.mjs";

const isRecord = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

function readJsonObject(path) {
  const text = readFileSync(path, "utf8");
  let value;
  try { value = JSON.parse(text); }
  catch { throw new Error(`${path}: invalid JSON`); }
  if (!isRecord(value)) throw new Error(`${path}: must be an object`);
  return value;
}

// 웹 토큰 페이지는 `<base>/api/mcp`를 보여 주는데 생성기는 base를 받는다. 그대로 붙여넣어도
// `.../api/mcp/api/mcp`가 되지 않도록 꼬리를 떼고, 끝 슬래시도 지운다. owner 쪽이 더 기므로 먼저 본다.
const normalizeServer = (value) => (value ?? "")
  .replace(/\/api\/mcp\/owner\/?$/, "")
  .replace(/\/api\/mcp\/?$/, "")
  .replace(/\/$/, "");

// 이미 연결된 저장소는 답이 .mcp.json에 있다. **이 읽기는 던지지 않는다** — 권위 있는 파싱은
// 쓰기 준비 단계에 그대로 두어 기존 오류 문장과 종료코드를 보존한다(harness-init.test.mjs의 malformed 입력 시험).
function recoverServerFromMcp(path) {
  if (!existsSync(path)) return { url: null, unreadable: false };
  try {
    const value = JSON.parse(readFileSync(path, "utf8"));
    const url = value?.mcpServers?.harness?.url;
    return { url: typeof url === "string" ? url : null, unreadable: false };
  } catch { return { url: null, unreadable: true }; }
}

async function init() {
  const args = process.argv.slice(2);
  const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
  const ROOT = opt("--root", ".");
  const CONFIG = join(ROOT, opt("--config", "harness.json"));
  const ADOPT = args.includes("--adopt");
  const DRY = args.includes("--dry-run");
  // --owner는 더 이상 생성기의 일이 아니다(B-1 선택지 3) — 소유자 서버도 사용자 범위에 등록되고,
  // 그 판단은 스킬이 `HARNESS_OWNER_TOKEN` 유무로 직접 한다. 이 플래그는 생성기가 파일을 썼기
  // 때문에 있었을 뿐이다. **조용히 무시하지는 않는다**: 옛 스킬이 그대로 넘길 수 있고, 알려지지 않은
  // 인자는 소리 없이 버려져 사용자가 소유자 서버를 잃고도 모르게 된다.
  if (args.includes("--owner")) {
    console.log("note: --owner no longer writes a server here — the skill registers harness_owner at user scope when HARNESS_OWNER_TOKEN is set");
  }
  // --print-project: 쓰기 없이 프로젝트 정체만 출력한다. harness.json이 없어도 동작해야 하므로 설정 파싱을 건너뛴다.
  const PRINT_PROJECT = args.includes("--print-project");
  // --register: git remote로 프로젝트를 등록(또는 이미 있으면 조회)하고 정체를 출력한다.
  // **사용자 토큰(hu_) 전용**이다 — 프로젝트 토큰은 이미 자기 프로젝트를 알고 있으므로 --print-project를 쓴다.
  // --print-project에 끼워 넣지 않는 이유: 그 모드의 계약은 "아무것도 쓰지 않는다"이고, 토큰 종류에 따라
  // 서버에 행을 만드는 동작을 그 이름 아래 숨기면 계약이 거짓이 된다.
  const REGISTER = args.includes("--register");
  // 템플릿은 플러그인에 동봉하지 않는다 — 서버가 인증된 요청에만 내려준다.
  // HARNESS_TEMPLATES_DIR는 개발·테스트에서 로컬 원본을 쓰기 위한 우회로다. 그때 플랜은 HARNESS_PLAN(기본 max)이 정한다 —
  // 서버가 없으니 무엇을 내려줄지도 여기서 같은 규칙(lib/deliver.mjs)으로 정한다.
  const TPL_DIR = process.env.HARNESS_TEMPLATES_DIR;
  const LOCAL_PLAN = process.env.HARNESS_PLAN ?? "max";
  const RUNBOOK_START = "<!-- harness:runbook:start -->", RUNBOOK_END = "<!-- harness:runbook:end -->";

  // 서비스 URL에 기본값을 두지 않는다 — 잘못된 호스트가 저장소에 박히면 조용히 다른 서비스를 가리킨다(C11).
  // 출처 순서: --server > HARNESS_SERVER > 기존 .mcp.json. 늘어난 출처는 전부 사용자가 직접 넣은 값이다.
  const mcpPath = join(ROOT, ".mcp.json");
  const recovered = recoverServerFromMcp(mcpPath);
  const SERVER = normalizeServer(opt("--server", process.env.HARNESS_SERVER) ?? recovered.url ?? "");
  if (!SERVER) {
    const note = recovered.unreadable ? " (.mcp.json could not be read)" : "";
    console.log(`Server URL required: pass --server <url> or set HARNESS_SERVER (shown on the web Tokens page)${note}`);
    process.exit(1);
  }

  // 쓰기 없는 모드. harness.json을 읽지 않으므로 첫 연결에서도 쓸 수 있다 —
  // 스킬은 이 값으로 harness.json 초안의 project 블록을 채운다(추측하지 않는다).
  if (PRINT_PROJECT) {
    const token = process.env.HARNESS_TOKEN;
    if (!token) { console.log("HARNESS_TOKEN required: issue one on the web Tokens page and export it in this shell"); process.exit(1); }
    const url = `${SERVER}/api/project`;
    let res;
    try { res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } }); }
    catch (e) { console.log(`Cannot reach ${url}: ${e.message}`); process.exit(1); }
    if (!res.ok) {
      const reason = await res.json().then((b) => b.error).catch(() => res.statusText);
      // 404는 구버전 서버다 — 이 경로가 아직 없다. 스킬은 지금까지처럼 사용자에게 물어서 진행한다.
      console.log(res.status === 404
        ? `Project identity unavailable (404): this server has no /api/project — ask for owner/repo/branch instead.`
        : `Project identity unavailable (${res.status}): ${reason}`);
      process.exit(1);
    }
    const body = await res.json().catch(() => null);
    if (!isRecord(body) || !isRecord(body.project)) {
      console.log("Unexpected /api/project response (no project object): plugin and server are out of step — update the harness plugin.");
      process.exit(1);
    }
    // language는 담기지 않는다 — harness.json에 옮기면 ?lang=ko로 템플릿 요청이 404가 된다.
    console.log(JSON.stringify(body.project));
    return;
  }

  // 첫 연결에는 harness.json도 프로젝트도 없다. git이 아는 것(origin·저장소의 기본 브랜치)으로 등록한다.
  // 서버가 (owner, repo)로 멱등 처리하므로 재실행은 새 프로젝트를 만들지 않고 기존 것을 돌려준다.
  if (REGISTER) {
    const token = process.env.HARNESS_TOKEN;
    if (!token) { console.log("HARNESS_TOKEN required: issue one on the web Tokens page and export it in this shell"); process.exit(1); }
    const git = (gitArgs, opts = {}) => {
      try { return execFileSync("git", gitArgs, { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], ...opts }).trim(); }
      catch { return ""; }
    };
    const remote = git(["remote", "get-url", "origin"]);
    if (!remote) { console.log("No git remote 'origin' here — ask for owner and repo instead."); process.exit(1); }
    const ref = parseRepoUrl(remote);
    if (!ref) { console.log(`Could not read owner/repo from the 'origin' remote (${remote}) — ask for them instead.`); process.exit(1); }
    // 등록하는 것은 **저장소의 기본 브랜치**다 — 웹 등록 폼(GitHub의 default_branch)과 같은 값. 사용자는 대개
    // 쓰던 기능 브랜치에서 init하므로 현재 브랜치를 보내면 그 브랜치가 프로젝트에 박힌다.
    // 1) 로컬 기호 참조: clone한 저장소에는 있다. `git init` 뒤 remote를 붙인 저장소에는 없다.
    // 2) origin에 묻기: 자격 증명 프롬프트로 멈추지 않게 GIT_TERMINAL_PROMPT=0, 매달리지 않게 10초.
    //    SSH 키 암호는 ssh가 터미널에서 직접 물을 수 있어 이 변수로 막히지 않는다 — 그때는 제한 시간 뒤 3)으로 간다.
    // 3) 현재 브랜치(예전 동작). 분리된 HEAD면 빈 문자열이고, 그때는 보내지 않아 서버 기본값(main)에 맡긴다.
    // 어느 단계로 떨어져도 알리는 줄은 내지 않는다 — 출력은 JSON 한 줄이고 스킬이 그것을 읽는다.
    const fromSymref = git(["symbolic-ref", "--quiet", "--short", "refs/remotes/origin/HEAD"]).replace(/^origin\//, "");
    const fromRemote = fromSymref ? "" : (/^ref: refs\/heads\/(.+)\tHEAD$/m.exec(
      git(["ls-remote", "--symref", "origin", "HEAD"], { env: { ...process.env, GIT_TERMINAL_PROMPT: "0" }, timeout: 10_000 }),
    )?.[1] ?? "");
    const branch = fromSymref || fromRemote || git(["branch", "--show-current"]);
    const url = `${SERVER}/api/projects`;
    let res;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ owner: ref.owner, repo: ref.repo, ...(branch ? { branch } : {}) }),
      });
    } catch (e) { console.log(`Cannot reach ${url}: ${e.message}`); process.exit(1); }
    if (!res.ok) {
      const reason = await res.json().then((b) => b.error).catch(() => res.statusText);
      // 401은 대개 프로젝트 토큰(hs_)을 쓴 경우다 — 그 토큰은 등록 경로를 지나지 않는다.
      console.log(res.status === 401
        ? `Registration needs a user token (hu_): ${reason}. With a project token (hs_) use --print-project instead.`
        : res.status === 404
          ? "Registration unavailable (404): this server has no /api/projects — ask for owner/repo/branch instead."
          : `Registration failed (${res.status}): ${reason}`);
      process.exit(1);
    }
    const body = await res.json().catch(() => null);
    if (!isRecord(body) || !isRecord(body.project)) {
      console.log("Unexpected /api/projects response (no project object): plugin and server are out of step — update the harness plugin.");
      process.exit(1);
    }
    // --print-project와 **같은 모양**을 낸다(owner·repo·branch·name·slug) — 스킬의 초안 경로가 하나로 유지된다.
    console.log(JSON.stringify(body.project));
    return;
  }

  let config;
  try { config = parseHarnessConfig(readFileSync(CONFIG, "utf8")); }
  catch (e) { console.log(`Config error: ${e.message}`); process.exit(1); }

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
    if (!isRecord(body) || !isRecord(body.templates) || !isRecord(body.entitlement)
        || !isPlan(body.entitlement.plan) || !Array.isArray(body.entitlement.agents)
        || !body.entitlement.agents.every((agent) => typeof agent === "string")) {
      console.log("Unexpected /api/templates response (invalid templates or entitlement): plugin and server are out of step — update the harness plugin.");
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
    if (typeof body !== "string") throw new Error(`Unexpected template body: ${lang}/${rel} must be a string`);
    return body;
  };
  // 보고 에이전트는 플랜이 허용하는 것만 — 플랜 밖 에이전트는 서버가 내려주지도 않는다. 이미 디스크에 있는 옛 파일은 건드리지 않고 lock에서만 빠진다.
  // feature-scout는 scout를 설정한 저장소에만 간다. **내려가는 목록이 런북의 "Report only" 표(report_table)도 정한다** —
  // 표와 파일이 같은 목록에서 나와야 런북이 없는 에이전트를 시키지 않는다(2026-09-22 mathgic: free 런북이 하드코딩된 네 행을 들고 있었다).
  const wanted = REPORT_AGENTS.filter((a) => a !== "feature-scout" || config.scout);
  const delivered = wanted.filter((a) => agents.includes(a));
  for (const a of wanted) if (!agents.includes(a)) console.log(`skip(plan): .claude/agents/${a}.md (not on the ${plan} plan)`);
  const vars = {
    ...buildVars(config),
    report_table: buildReportTable(delivered.map((a) => ({ name: a, description: templateDescription(tpl(`agents/${a}.md`), `${lang}/agents/${a}.md`) }))),
  };
  const targets = {};
  const add = (path, template, content) => {
    if (Object.hasOwn(targets, path)) throw new Error(`Duplicate generated path: ${path}`);
    targets[path] = { template, content };
  };

  for (const d of ["plans/README.md", "plans/template.md", "plans/verification-paths.md", "agents/README.md"])
    add(`docs/${d}`, `${lang}/docs/${d}`, renderTemplate(tpl(`docs/${d}`), vars));
  for (const a of delivered) add(`.claude/agents/${a}.md`, `${lang}/agents/${a}.md`, renderTemplate(tpl(`agents/${a}.md`), vars));
  for (const ws of config.workspaces)
    add(`.claude/agents/${ws.agent}.md`, `${lang}/agents/dev.md`, renderTemplate(tpl("agents/dev.md"), buildWorkspaceVars(config, ws)));

  const existing = {};
  for (const p of Object.keys(targets)) existing[p] = existsSync(join(ROOT, p)) ? readFileSync(join(ROOT, p), "utf8") : null;
  const lockPath = join(ROOT, "harness.lock.json");
  const lock = existsSync(lockPath) ? readJsonObject(lockPath) : null;
  if (lock && (lock.version !== 1 || !isRecord(lock.files)
      || !Object.values(lock.files).every((file) => isRecord(file) && typeof file.hash === "string" && typeof file.template === "string"))) {
    throw new Error("harness.lock.json: expected version 1 and file hashes/templates");
  }
  const writes = planWrites({ targets, existing, lock, adopt: ADOPT });

  for (const p of writes.refuse) console.log(`refuse: ${p}`);
  for (const p of writes.skipModified) console.log(`skip(modified): ${p}`);
  if (writes.refuse.length) { console.log("Conflicts with existing files. Rerun with --adopt to take them over, or move them out of the way."); process.exit(3); }

  // 모든 읽기·검증·렌더·병합을 끝낸 뒤 기록한다. 입력 오류가 생성물만 남기고 lock을 누락시키지 않게 한다.
  // 런북: 마커 사이 절만 우리 것. 병합 파일이라 lock에 넣지 않는다. **런북은 플랜과 무관하게 한 판이다** —
  // 옛 `CLAUDE.runbook.free.md`는 지웠고, DB 행이 남아 있어도 `deliver.mjs`가 내려보내지 않는다.
  // 플랜 차이는 런북 텍스트가 아니라 파이프라인 그래프가 담는다(free에는 verify·doc-audit 노드가 없다).
  // 런북은 자기 판을 본문에 적는다({{runbook_version}}) — 세션이 그 값을 pipeline_next에 넘겨, 서버가
  // "마지막으로 init한 브랜치"가 아니라 이 checkout의 CLAUDE.md로 표류를 판정하게 한다. 해시는 치환 전 원문에서
  // 뽑으므로 순환이 없다. CRLF는 LF로 맞춘 뒤 뽑는다: DB는 seed가 LF로 정규화한 본문을 가지는데
  // (scripts/seed-templates.ts), 로컬 템플릿 모드(TPL_DIR)는 autocrlf 작업본을 그대로 읽기 때문이다.
  // 서버에 보고하는 판도 같은 값이다(아래 POST /api/runbook).
  const runbookVersionNow = runbookVersion(tpl("CLAUDE.runbook.md").replace(/\r\n/g, "\n"));
  const runbookBlock = `${RUNBOOK_START}\n${renderTemplate(tpl("CLAUDE.runbook.md"), { ...vars, runbook_version: runbookVersionNow })}\n${RUNBOOK_END}`;
  const runbookPath = join(ROOT, "CLAUDE.md");
  let runbook = existsSync(runbookPath) ? readFileSync(runbookPath, "utf8") : "";
  const startIndex = runbook.indexOf(RUNBOOK_START), endIndex = runbook.indexOf(RUNBOOK_END);
  const hasReplaceableRunbookBlock = startIndex >= 0 && endIndex > startIndex;
  runbook = hasReplaceableRunbookBlock
    ? runbook.slice(0, startIndex) + runbookBlock + runbook.slice(endIndex + RUNBOOK_END.length)
    : (runbook ? runbook.replace(/\s*$/, "\n\n") : "") + runbookBlock + "\n";

  // .mcp.json: 서버를 **더 이상 여기 쓰지 않는다**(B-1 선택지 3 — 사용자 범위에 머신당 1회 등록한다).
  // 읽기는 남는다. 두 가지 이유다: ① 여기가 권위 있는 파싱이고(위 회수 읽기는 던지지 않으므로 깨진
  // 입력의 오류 문장·종료코드가 지금과 같다), ② 이미 연결된 저장소에서 옛 항목을 **걷어내야** 한다 —
  // 범위 우선순위가 `local > project > user`라, 남겨 두면 저장소 항목이 사용자 범위를 계속 이긴다.
  const hasMcpFile = existsSync(mcpPath);
  const mcp = hasMcpFile ? readJsonObject(mcpPath) : {};
  if (mcp.mcpServers !== undefined && !isRecord(mcp.mcpServers)) throw new Error(".mcp.json mcpServers: must be an object");
  const stale = isRecord(mcp.mcpServers)
    ? ["harness", "harness_owner"].filter((name) => Object.hasOwn(mcp.mcpServers, name))
    : [];
  for (const name of stale) delete mcp.mcpServers[name];
  // 걷어낼 게 없으면 손대지 않는다 — 남의 .mcp.json을 매 실행 재기록하면 잡음이고 `write:` 줄도 거짓이 된다.
  const mcpContent = stale.length ? JSON.stringify(mcp, null, 2) + "\n" : null;

  const nextLock = buildLock(Object.fromEntries(writes.write.map((p) => [p, targets[p]])));
  for (const p of writes.skipModified) nextLock.files[p] = lock.files[p];
  const lockContent = JSON.stringify(nextLock, null, 2) + "\n";

  const write = (path, content) => {
    if (DRY) return;
    const fullPath = join(ROOT, path);
    mkdirSync(dirname(fullPath), { recursive: true });
    writeFileSync(fullPath, content);
  };
  for (const path of writes.write) { console.log(`write: ${path}`); write(path, targets[path].content); }
  console.log(`write: CLAUDE.md (runbook ${hasReplaceableRunbookBlock ? "replaced" : "inserted"})`);
  write("CLAUDE.md", runbook);
  if (mcpContent !== null) {
    console.log(`write: .mcp.json (removed ${stale.join(", ")} — the server is registered once per machine at user scope)`);
    write(".mcp.json", mcpContent);
    // 지운 항목이 **서버 URL의 출처이기도 했다면**, 이 저장소의 마지막 기록이 방금 사라진 것이다.
    // 생성기는 사용자 범위 설정을 읽지 않으므로(3-a의 원칙) 보완하지 않고 알린다 — 스킬이 HARNESS_SERVER를 심는다.
    if (stale.includes("harness") && !opt("--server", process.env.HARNESS_SERVER)) {
      console.log(`note: that entry was also this repository's only record of the server URL — make sure HARNESS_SERVER is set (${SERVER}) or pass --server on the next run`);
    }
  }
  write("harness.lock.json", lockContent);
  console.log(`done: write ${writes.write.length} · skip ${writes.skipModified.length}`);
  // 스킬이 `claude mcp add`에 넘길 주소. 출처 순서(--server > HARNESS_SERVER > .mcp.json)와 꼬리
  // 정규화가 생성기 안에만 있으므로, 여기서 알려 주지 않으면 스킬은 등록할 주소를 알 길이 없다.
  console.log(`server: ${SERVER}`);

  // 심은 런북이 어느 판인지 서버에 남긴다 — pipeline_next가 이것으로 표류를 말한다(제안서 "저장소 런북").
  // 쓴 뒤에 보낸다: 파일이 진실이고 보고는 그 사본이다. 실패해도 중단하지 않는다 —
  // 보고가 없으면 판정은 "낡음"으로 기울고, 그쪽이 안전한 방향이다.
  // --dry-run은 아무것도 쓰지 않았고, 로컬 우회로(TPL_DIR)는 서버도 토큰도 없다.
  if (!DRY && !TPL_DIR) {
    const note = (why) => console.log(`note: runbook version not recorded (${why}) — the session will report the runbook as out of date until the next run`);
    try {
      const res = await fetch(`${SERVER}/api/runbook`, {
        method: "POST",
        headers: { Authorization: `Bearer ${process.env.HARNESS_TOKEN}`, "Content-Type": "application/json" },
        body: JSON.stringify({ version: runbookVersionNow }),
      });
      if (!res.ok) note(res.status);
    } catch (e) { note(e.message); }
  }
}

try { await init(); }
catch (error) {
  console.error(`Initialization error: ${error.message}`);
  process.exitCode = 1;
}

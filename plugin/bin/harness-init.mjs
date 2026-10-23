#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { parseHarnessConfig } from "../lib/configuration/harness-config.mjs";
import { parseRepoUrl } from "../lib/repo-url.mjs";
import { deliverable } from "../lib/templates/deliver.mjs";
import { REPORT_AGENTS, capReason, isPlan, withinLimit } from "../lib/plans/entitlement.mjs";
import { mergeClientLock, planWrites } from "../lib/templates/manifest.mjs";
import { renderTemplate } from "../lib/templates/render.mjs";
import { runbookVersion, codexRunbookVersion } from "../lib/templates/runbook.mjs";
import { parseClient, RUNTIME_PROTOCOL } from "../lib/execution/client-runtime.mjs";
import { validateCodexBundle } from "../lib/templates/codex-bundle.mjs";
import { renderCodexRole, verifierPackage } from "../runtime/codex-agent.mjs";
import { acquireInitGuard, atomicWrite, safeTarget, writeGenerated } from "../runtime/file-ownership.mjs";
import { serverUrl } from "../runtime/mcp-client.mjs";
import { buildReportTable, buildVars, buildWorkspaceVars, templateDescription } from "../lib/templates/vars.mjs";

const isRecord = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const progress = { phase: "preflight", written: [] };
const REST_DEADLINE_MS = 20_000;

async function responseFailure(res, server, token) {
  const body = await res.json().catch(() => null);
  const reason = typeof body?.error === "string" ? body.error : res.statusText;
  if (res.status === 429) {
    const delay = Number.isInteger(body?.retryAfterSec) && body.retryAfterSec > 0
      ? body.retryAfterSec : Number(res.headers.get("Retry-After"));
    return `${reason} ${Number.isInteger(delay) && delay > 0 ? `Wait ${delay} seconds before retrying.` : "Wait before retrying."} Do not retry immediately.`;
  }
  const reconnect = typeof body?.reconnectPath === "string" && /^\/p\/[^/?#]+$/.test(body.reconnectPath)
    ? ` Reconnect on the web: ${server}${body.reconnectPath}.` : "";
  const credential = res.status === 401
    ? ` If this project was disconnected, reconnect on the web${token?.startsWith("hu_") ? "." : " and issue a new project token."}` : "";
  return `${reason}${reconnect}${credential}`;
}

function readJsonObject(path) {
  const text = readFileSync(path, "utf8");
  let value;
  try { value = JSON.parse(text); }
  catch { throw new Error(`${path}: invalid JSON`); }
  if (!isRecord(value)) throw new Error(`${path}: must be an object`);
  return value;
}

const normalizeServer = (value) => (value ?? "")
  .replace(/\/api\/mcp\/owner\/?$/, "")
  .replace(/\/api\/mcp\/?$/, "")
  .replace(/\/$/, "");

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
  const CLIENT = parseClient(opt("--client", "claude"));
  const CONFIG = join(ROOT, opt("--config", "harness.json"));
  const ADOPT = args.includes("--adopt");
  const DRY = args.includes("--dry-run");
  if (args.includes("--owner")) {
    console.log("note: --owner no longer writes a server here — the skill registers harness_owner at user scope when HARNESS_OWNER_TOKEN is set");
  }
  const PRINT_PROJECT = args.includes("--print-project");
  const REGISTER = args.includes("--register");
  if (PRINT_PROJECT && REGISTER || REGISTER && DRY || (PRINT_PROJECT || REGISTER) && (ADOPT || DRY)) throw new Error("Conflicting init modes");
  const known = new Set(["--root", "--config", "--server", "--client", "--adopt", "--owner", "--dry-run", "--print-project", "--register"]);
  for (let index = 0; index < args.length; index++) {
    if (!known.has(args[index]) || args.indexOf(args[index]) !== index) throw new Error("Unknown or duplicate init option");
    if (["--root", "--config", "--server", "--client"].includes(args[index]) && (!args[++index] || args[index].startsWith("--"))) throw new Error("Missing init option value");
  }
  const TPL_DIR = process.env.HARNESS_TEMPLATES_DIR;
  const LOCAL_PLAN = process.env.HARNESS_PLAN ?? "max";
  const RUNBOOK_START = "<!-- harness:runbook:start -->", RUNBOOK_END = "<!-- harness:runbook:end -->";

  const mcpPath = join(ROOT, ".mcp.json");
  const recovered = CLIENT === "claude" ? recoverServerFromMcp(mcpPath) : { url: null, unreadable: false };
  const SERVER = normalizeServer(opt("--server", process.env.HARNESS_SERVER) ?? recovered.url ?? "");
  if (CLIENT === "codex" && SERVER) serverUrl(SERVER);
  if (!SERVER) {
    const note = recovered.unreadable ? " (.mcp.json could not be read)" : "";
    console.log(`Server URL required: pass --server <url> or set HARNESS_SERVER (shown on the web Tokens page)${note}`);
    process.exit(1);
  }

  if (PRINT_PROJECT) {
    const token = process.env.HARNESS_TOKEN;
    if (!token) { console.log("HARNESS_TOKEN required: issue one on the web Tokens page and export it in this shell"); process.exit(1); }
    const url = `${SERVER}/api/project`;
    let res;
    try { res = await fetch(url, { signal: AbortSignal.timeout(REST_DEADLINE_MS), headers: { Authorization: `Bearer ${token}` } }); }
    catch (e) { console.log(`Cannot reach ${url}: ${e.message}`); process.exit(1); }
    if (!res.ok) {
      const reason = await responseFailure(res, SERVER, token);
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
    console.log(JSON.stringify(body.project));
    return;
  }

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
    const fromSymref = git(["symbolic-ref", "--quiet", "--short", "refs/remotes/origin/HEAD"]).replace(/^origin\//, "");
    const fromRemote = fromSymref ? "" : (/^ref: refs\/heads\/(.+)\tHEAD$/m.exec(
      git(["ls-remote", "--symref", "origin", "HEAD"], { env: { ...process.env, GIT_TERMINAL_PROMPT: "0" }, timeout: 10_000 }),
    )?.[1] ?? "");
    const branch = fromSymref || fromRemote || git(["branch", "--show-current"]);
    const url = `${SERVER}/api/projects`;
    const registrationSignal = AbortSignal.timeout(REST_DEADLINE_MS);
    let res;
    try {
      res = await fetch(url, {
        method: "POST",
        signal: registrationSignal,
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ owner: ref.owner, repo: ref.repo, ...(branch ? { branch } : {}) }),
      });
    } catch (e) { console.log(`Registration result unknown: ${e.message}. The server may have saved the project; check it on the web before retrying. No automatic retry or rollback was performed.`); process.exit(1); }
    if (!res.ok) {
      const reason = await responseFailure(res, SERVER, token);
      console.log(res.status === 401
        ? `Registration needs a user token (hu_): ${reason}. With a project token (hs_) use --print-project instead.`
        : res.status === 404
          ? "Registration unavailable (404): this server has no /api/projects — ask for owner/repo/branch instead."
          : `Registration failed (${res.status}): ${reason}`);
      process.exit(1);
    }
    const body = await res.json().catch(() => null);
    if (registrationSignal.aborted) {
      console.log("Registration result unknown: response deadline exceeded. The server may have saved the project; check it on the web before retrying. No automatic retry or rollback was performed.");
      process.exit(1);
    }
    if (!isRecord(body) || !isRecord(body.project)) {
      console.log("Unexpected /api/projects response (no project object): plugin and server are out of step — update the harness plugin.");
      process.exit(1);
    }
    console.log(JSON.stringify(body.project));
    return;
  }

  let config;
  try { config = parseHarnessConfig(readFileSync(CONFIG, "utf8")); }
  catch (e) { console.log(`Config error: ${e.message}`); process.exit(1); }

  const lang = config.language;
  const token = process.env.HARNESS_TOKEN;
  const projectScope = token?.startsWith("hu_") ? config.project.slug : null;
  if (!TPL_DIR && token?.startsWith("hu_") && !projectScope?.trim()) {
    console.log("Config error: a user token (hu_) requires harness.json project.slug. Run /harness:init with the updated plugin to recover the registered slug while preserving the existing configuration.");
    process.exit(1);
  }

  let templates, entitlement;
  if (TPL_DIR) {
    if (!isPlan(LOCAL_PLAN)) { console.log(`Config error: HARNESS_PLAN must be one of free, pro, max (got ${LOCAL_PLAN})`); process.exit(1); }
    const dir = join(TPL_DIR, lang);
    const rows = readdirSync(dir, { recursive: true, withFileTypes: true }).filter((d) => d.isFile())
      .map((d) => { const full = join(d.parentPath ?? d.path, d.name); return { path: relative(dir, full).split("\\").join("/"), body: readFileSync(full, "utf8") }; });
    ({ templates, entitlement } = deliverable(rows, LOCAL_PLAN, CLIENT));
  } else {
    if (!token) { console.log("HARNESS_TOKEN required: issue one on the web Tokens page and export it in this shell"); process.exit(1); }
    const url = new URL(`${SERVER}/api/templates`);
    url.searchParams.set("lang", lang);
    if (CLIENT === "codex") url.searchParams.set("client", CLIENT);
    if (projectScope) url.searchParams.set("project", projectScope);
    let res;
    try { res = await fetch(url, { signal: AbortSignal.timeout(REST_DEADLINE_MS), headers: { Authorization: `Bearer ${token}` } }); }
    catch (e) { console.log(`Cannot reach ${url}: ${e.message}`); process.exit(1); }
    if (!res.ok) {
      const reason = await responseFailure(res, SERVER, token);
      console.log(`Templates unavailable (${res.status}): ${reason}`);
      process.exit(1);
    }
    const body = await res.json().catch(() => null);
    if (!isRecord(body) || !isRecord(body.templates) || !isRecord(body.entitlement)
        || !isPlan(body.entitlement.plan) || !Array.isArray(body.entitlement.agents)
        || !body.entitlement.agents.every((agent) => typeof agent === "string")) {
      console.log("Unexpected /api/templates response (invalid templates or entitlement): plugin and server are out of step — update the harness plugin.");
      process.exit(1);
    }
    ({ templates, entitlement } = body);
    if (CLIENT === "codex" && (body.runtime?.client !== CLIENT || body.runtime?.protocol !== RUNTIME_PROTOCOL)) throw new Error("Server does not support Codex runtime; no files generated");
  }
  let verifier;
  if (CLIENT === "codex") {
    validateCodexBundle(Object.entries(templates).map(([path, body]) => ({ path, body })), entitlement.plan);
    verifier = verifierPackage();
    if (TPL_DIR) {
      if (!token) throw new Error("HARNESS_TOKEN and a Codex-capable server are required even with local Codex templates");
      const url = new URL(`${SERVER}/api/templates`);
      url.searchParams.set("lang", lang); url.searchParams.set("client", CLIENT);
      if (projectScope) url.searchParams.set("project", projectScope);
      const res = await fetch(url, { signal: AbortSignal.timeout(REST_DEADLINE_MS), headers: { Authorization: `Bearer ${token}` } });
      const remote = await res.json();
      if (!res.ok || remote.runtime?.client !== CLIENT || remote.runtime?.protocol !== RUNTIME_PROTOCOL || remote.entitlement?.plan !== entitlement.plan || typeof remote.templates?.["CODEX.runbook.md"] !== "string" || codexRunbookVersion(remote.templates["CODEX.runbook.md"]) !== codexRunbookVersion(templates["CODEX.runbook.md"])) throw new Error("Local Codex source and remote supported runtime/version/entitlement differ");
      validateCodexBundle(Object.entries(remote.templates).map(([path, body]) => ({ path, body })), remote.entitlement.plan);
    }
  }
  const { plan, agents } = entitlement;
  console.log(`plan: ${plan}`);

  if (!withinLimit(plan, "workspaces", config.workspaces.length)) {
    console.log(`${capReason(plan, "workspaces")}: harness.json has ${config.workspaces.length} workspaces. project_sync would refuse — drop workspaces or upgrade the plan on the web.`);
    process.exit(1);
  }

  const tpl = (rel) => {
    const body = templates[rel];
    if (body === undefined) { console.log(`Template missing${TPL_DIR ? "" : " on server"}: ${lang}/${rel}`); process.exit(1); }
    if (typeof body !== "string") throw new Error(`Unexpected template body: ${lang}/${rel} must be a string`);
    return body;
  };
  const wanted = REPORT_AGENTS;
  const delivered = wanted.filter((a) => agents.includes(a));
  for (const a of wanted) if (!agents.includes(a)) console.log(`skip(plan): ${CLIENT === "codex" ? ".codex" : ".claude"}/agents/${a}.${CLIENT === "codex" ? "toml" : "md"} (not on the ${plan} plan)`);
  const vars = {
    ...buildVars(config, CLIENT),
    report_table: buildReportTable(delivered.map((a) => ({ name: a, description: templateDescription(tpl(`agents/${a}.md`), `${lang}/agents/${a}.md`) }))),
  };
  const targets = {};
  const runbookVersionNow = CLIENT === "codex" ? codexRunbookVersion(tpl("CODEX.runbook.md")) : runbookVersion(tpl("CLAUDE.runbook.md").replace(/\r\n/g, "\n"));
  const add = (path, template, content) => {
    if (Object.hasOwn(targets, path)) throw new Error(`Duplicate generated path: ${path}`);
    targets[path] = { template, content };
  };

  for (const d of ["plans/README.md", "plans/template.md", "plans/verification-paths.md", "agents/README.md"])
    add(`docs/${d}`, `${lang}/docs/${d}`, renderTemplate(tpl(`docs/${d}`), vars));
  for (const a of delivered) {
    const body = renderTemplate(tpl(`agents/${a}.md`), vars);
    add(CLIENT === "codex" ? `.codex/agents/${a}.toml` : `.claude/agents/${a}.md`, `${lang}/agents/${a}.md`, CLIENT === "codex" ? renderCodexRole(body, a) : body);
  }
  for (const ws of config.workspaces) {
    const body = renderTemplate(tpl("agents/dev.md"), buildWorkspaceVars(config, ws, CLIENT));
    add(CLIENT === "codex" ? `.codex/agents/${ws.agent}.toml` : `.claude/agents/${ws.agent}.md`, `${lang}/agents/dev.md`, CLIENT === "codex" ? renderCodexRole(body, "dev") : body);
  }
  if (CLIENT === "codex") {
    add("docs/harness/codex-runbook.md", `${lang}/CODEX.runbook.md`, renderTemplate(tpl("CODEX.runbook.md"), { ...vars, runbook_version: runbookVersionNow }));
    add("docs/harness/codex-package.json", "harness-runtime-v1/package", JSON.stringify({ client: CLIENT, protocol: RUNTIME_PROTOCOL, runbook: runbookVersionNow, language: lang, verifier }, null, 2) + "\n");
  }
  for (const name of Object.keys(targets)) safeTarget(ROOT, name);
  progress.phase = "planned";
  const releaseGuard = DRY ? () => {} : await acquireInitGuard(ROOT);
  try {

  const existing = {};
  for (const p of Object.keys(targets)) existing[p] = existsSync(join(ROOT, p)) ? readFileSync(join(ROOT, p), "utf8") : null;
  const lockPath = safeTarget(ROOT, "harness.lock.json");
  const lock = existsSync(lockPath) ? readJsonObject(lockPath) : null;
  if (lock && (lock.version !== 1 || !isRecord(lock.files)
      || !Object.values(lock.files).every((file) => isRecord(file) && typeof file.hash === "string" && typeof file.template === "string"))) {
    throw new Error("harness.lock.json: expected version 1 and file hashes/templates");
  }
  const writes = planWrites({ targets, existing, lock, adopt: ADOPT });

  for (const p of writes.refuse) console.log(`refuse: ${p}`);
  for (const p of writes.skipModified) console.log(`skip(modified): ${p}`);
  if (writes.refuse.length) { console.log("Conflicts with existing files. Rerun with --adopt to take them over, or move them out of the way."); process.exitCode = 3; return; }

  const runbookBlock = CLIENT === "claude" ? `${RUNBOOK_START}\n${renderTemplate(tpl("CLAUDE.runbook.md"), { ...vars, runbook_version: runbookVersionNow })}\n${RUNBOOK_END}` : "";
  let runbook = "", hasReplaceableRunbookBlock = false;
  if (CLIENT === "claude") {
    const runbookPath = join(ROOT, "CLAUDE.md"), present = existsSync(runbookPath);
    runbook = present ? readFileSync(runbookPath, "utf8") : "";
    existing["CLAUDE.md"] = present ? runbook : null;
    const startIndex = runbook.indexOf(RUNBOOK_START), endIndex = runbook.indexOf(RUNBOOK_END);
    hasReplaceableRunbookBlock = startIndex >= 0 && endIndex > startIndex;
    runbook = hasReplaceableRunbookBlock
      ? runbook.slice(0, startIndex) + runbookBlock + runbook.slice(endIndex + RUNBOOK_END.length)
      : (runbook ? runbook.replace(/\s*$/, "\n\n") : "") + runbookBlock + "\n";
  }

  const hasMcpFile = CLIENT === "claude" && existsSync(mcpPath);
  if (hasMcpFile) existing[".mcp.json"] = readFileSync(mcpPath, "utf8");
  const mcp = hasMcpFile ? readJsonObject(mcpPath) : {};
  if (mcp.mcpServers !== undefined && !isRecord(mcp.mcpServers)) throw new Error(".mcp.json mcpServers: must be an object");
  const stale = isRecord(mcp.mcpServers)
    ? ["harness", "harness_owner"].filter((name) => Object.hasOwn(mcp.mcpServers, name))
    : [];
  for (const name of stale) delete mcp.mcpServers[name];
  const qaMcp = CLIENT === "claude" && config.qa ? { type: "http", url: config.qa.mcpUrl } : null;
  if (qaMcp) {
    const currentQa = mcp.mcpServers?.harness_qa_browser;
    if (currentQa && JSON.stringify(currentQa) !== JSON.stringify(qaMcp)) throw new Error("Existing harness_qa_browser differs from qa.mcpUrl; resolve the explicit test endpoint before init");
    mcp.mcpServers ??= {};
    mcp.mcpServers.harness_qa_browser = qaMcp;
  }
  const mcpContent = stale.length || qaMcp ? JSON.stringify(mcp, null, 2) + "\n" : null;

  const nextLock = mergeClientLock(lock, targets, writes, CLIENT);
  const lockContent = JSON.stringify(nextLock, null, 2) + "\n";

  const write = (path, content) => {
    if (DRY) return;
    safeTarget(ROOT, path);
    const previous = Object.hasOwn(existing, path) ? existing[path] : null;
    if (Object.hasOwn(existing, path) && (existsSync(join(ROOT, path)) ? readFileSync(join(ROOT, path), "utf8") : null) !== previous) throw new Error(`Output changed during init: ${path}`);
    writeGenerated(ROOT, path, content);
    progress.written.push(path);
  };
  for (const path of writes.write) { console.log(`write: ${path}`); write(path, targets[path].content); }
  if (CLIENT === "claude") {
    console.log(`write: CLAUDE.md (runbook ${hasReplaceableRunbookBlock ? "replaced" : "inserted"})`);
    write("CLAUDE.md", runbook);
  }
  if (mcpContent !== null) {
    console.log(qaMcp ? `write: .mcp.json (configured QA browser; removed legacy entries: ${stale.join(", ") || "none"})` : `write: .mcp.json (removed ${stale.join(", ")} — the server is registered once per machine at user scope)`);
    write(".mcp.json", mcpContent);
    if (stale.includes("harness") && !opt("--server", process.env.HARNESS_SERVER)) {
      console.log(`note: that entry was also this repository's only record of the server URL — make sure HARNESS_SERVER is set (${SERVER}) or pass --server on the next run`);
    }
  }
  if (!DRY) atomicWrite(safeTarget(ROOT, "harness.lock.json"), lockContent);
  progress.phase = DRY ? "planned" : "files-written";
  console.log(`${CLIENT === "codex" ? progress.phase : "done"}: write ${writes.write.length} · skip ${writes.skipModified.length}`);
  console.log(`server: ${SERVER}`);
  } finally { releaseGuard(); }

  if (CLIENT === "claude" && !DRY && !TPL_DIR) {
    const note = (why) => console.log(`note: runbook version not recorded (${why}) — resolve the reported error, then rerun /harness:init to record it`);
    try {
      const res = await fetch(`${SERVER}/api/runbook`, {
        method: "POST",
        signal: AbortSignal.timeout(REST_DEADLINE_MS),
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ version: runbookVersionNow, ...(projectScope ? { project: projectScope } : {}) }),
      });
      if (!res.ok) {
        const reason = await responseFailure(res, SERVER, token);
        note(`${res.status}: ${reason}`);
        if (res.status === 429) {
          console.log("stop: request limit reached after file generation. Keep the generated files and rerun /harness:init after the stated wait; the runbook version was not recorded.");
          process.exitCode = 1;
        }
        if ([401, 403, 409].includes(res.status)) {
          console.log("stop: server access was refused after file generation. Keep the generated files; resolve the reported error before MCP registration, project_sync, or declaring init complete.");
        }
      } else { await res.body?.cancel(); }
    } catch (e) { note(e.message); }
  }
}

try { await init(); }
catch (error) {
  console.error(`Initialization error: ${error.message}`);
  console.error(`phase: ${progress.phase}; completed files: ${progress.written.join(", ") || "none"}; preserve these files and retry without automatic adopt`);
  process.exitCode = 1;
}

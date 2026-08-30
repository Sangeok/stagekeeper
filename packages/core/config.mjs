// 순수. harness.json → 정규화된 설정. 실패는 필드 경로가 붙은 Error 하나로.
const AGENT_ID_RE = /^[a-z][a-z0-9-]*$/;
const EXECUTORS = new Set(["local", "routine"]);
const RELEASE_AUTH = new Set(["none", "verifier"]);

function fail(path, msg) { throw new Error(`harness.json ${path}: ${msg}`); }
function str(v, path) { if (typeof v !== "string" || v === "") fail(path, "must be a non-empty string"); return v; }

export function parseHarnessConfig(input) {
  const raw = typeof input === "string" ? JSON.parse(input) : input;
  if (raw === null || typeof raw !== "object") fail("", "must be an object");
  if (raw.version !== 1) fail("version", "only version 1 is supported");
  if (raw.project === undefined) fail("project", "required");
  const p = raw.project;
  const project = {
    owner: str(p.owner, "project.owner"), repo: str(p.repo, "project.repo"), branch: str(p.branch, "project.branch"),
    name: p.name === undefined ? p.repo : str(p.name, "project.name"),
  };
  const language = raw.language === undefined ? "en" : str(raw.language, "language");
  if (!Array.isArray(raw.workspaces) || raw.workspaces.length === 0) fail("workspaces", "at least one workspace");
  const seen = new Set();
  const workspaces = raw.workspaces.map((w, i) => {
    const at = `workspaces[${i}]`;
    const agent = str(w.agent, `${at}.agent`);
    if (!AGENT_ID_RE.test(agent)) fail(`${at}.agent`, "must start with a lowercase letter and use only lowercase letters, digits, and dashes");
    if (seen.has(agent)) fail(`${at}.agent`, `duplicate agent: ${agent}`);
    seen.add(agent);
    if (!Array.isArray(w.verify) || w.verify.length === 0) fail(`${at}.verify`, "at least one verify command");
    return {
      id: str(w.id, `${at}.id`), path: str(w.path, `${at}.path`), agent,
      verify: w.verify.map((c, j) => str(c, `${at}.verify[${j}]`)),
      knowledge: w.knowledge === undefined ? null : str(w.knowledge, `${at}.knowledge`),
      readOnly: Array.isArray(w.readOnly) ? w.readOnly.map((r, j) => str(r, `${at}.readOnly[${j}]`)) : [],
    };
  });
  const e = raw.executor === undefined ? { kind: "local" } : raw.executor;
  if (!EXECUTORS.has(e.kind)) fail("executor.kind", "local | routine");
  if (e.kind === "routine" && !Number.isInteger(e.commandIssue)) fail("executor.commandIssue", "routine executor needs commandIssue (an integer)");
  const executor = { kind: e.kind, commandIssue: e.kind === "routine" ? e.commandIssue : null };
  let release = null;
  if (raw.release !== undefined) {
    const auth = raw.release.auth === undefined ? "none" : raw.release.auth;
    if (!RELEASE_AUTH.has(auth)) fail("release.auth", "none | verifier");
    release = { baseUrl: str(raw.release.baseUrl, "release.baseUrl").replace(/\/$/, ""), auth };
  }
  const scout = raw.scout === undefined ? null : { question: str(raw.scout.question, "scout.question") };
  return { version: 1, project, language, workspaces, executor, release, scout };
}

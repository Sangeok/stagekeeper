// 순수. harness.json → 정규화된 설정. 실패는 필드 경로가 붙은 Error 하나로.
import { validateWorkspaceSemantics } from "./workspaces.mjs";

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
    // 선택. hs_는 토큰이 프로젝트를 알고 있어 없어도 되지만, hu_는 이 값이 없으면 가리킬 대상이 없다 —
    // optional은 하위호환을 위한 것이지 hu_가 슬러그 없이 동작한다는 뜻이 아니다.
    slug: p.slug === undefined ? null : str(p.slug, "project.slug"),
  };
  const language = raw.language === undefined ? "en" : str(raw.language, "language");
  const workspaces = validateWorkspaceSemantics(raw.workspaces, {
    normalizeKnowledge: (value, path) => value === undefined ? null : str(value, path),
    normalizeReadOnly: (value) => value === undefined ? [] : value,
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

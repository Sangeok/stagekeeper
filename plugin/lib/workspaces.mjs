import { REPORT_AGENTS } from "./entitlement.mjs";
const AGENT_ID_RE = /^[a-z][a-z0-9-]*$/;
function fail(path, message) { throw new Error(`harness.json ${path}: ${message}`); }
function str(value, path) { if (typeof value !== "string" || value === "") fail(path, "must be a non-empty string"); return value; }
function validateKnowledge(value, path) { return value === null ? null : str(value, path); }

export function validateWorkspaceSemantics(input, { normalizeKnowledge = (value) => value, normalizeReadOnly = (value) => value } = {}) {
  if (!Array.isArray(input) || input.length === 0) fail("workspaces", "at least one workspace");
  const seen = new Set();
  return input.map((w, i) => {
    const at = `workspaces[${i}]`;
    const agent = str(w?.agent, `${at}.agent`);
    if (!AGENT_ID_RE.test(agent)) fail(`${at}.agent`, "must start with a lowercase letter and use only lowercase letters, digits, and dashes");
    if (REPORT_AGENTS.includes(agent)) fail(`${at}.agent`, `reserved report agent: ${agent}`);
    if (seen.has(agent)) fail(`${at}.agent`, `duplicate agent: ${agent}`);
    seen.add(agent);
    if (!Array.isArray(w.verify) || w.verify.length === 0) fail(`${at}.verify`, "at least one verify command");
    const readOnly = normalizeReadOnly(w.readOnly);
    if (!Array.isArray(readOnly)) fail(`${at}.readOnly`, "must be an array of paths");
    return {
      id: str(w.id, `${at}.id`), path: str(w.path, `${at}.path`), agent,
      verify: w.verify.map((c, j) => str(c, `${at}.verify[${j}]`)),
      knowledge: validateKnowledge(normalizeKnowledge(w.knowledge, `${at}.knowledge`), `${at}.knowledge`),
      readOnly: readOnly.map((r, j) => str(r, `${at}.readOnly[${j}]`)),
    };
  });
}

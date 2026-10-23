import { limitsFor } from "../plans/entitlement.mjs";
import { RUNTIME_MARKER } from "../execution/client-runtime.mjs";
import { stubOf } from "./template-boundary.mjs";

export const COMMON_DOCS = ["docs/plans/README.md", "docs/plans/template.md", "docs/plans/verification-paths.md", "docs/agents/README.md"];

export function validateCodexBundle(rows, plan) {
  const templates = Object.fromEntries(rows.map(({ path, body }) => [path, body]));
  const roles = ["dev", ...limitsFor(plan).agents];
  const required = ["CODEX.runbook.md", ...COMMON_DOCS, ...roles.map(role => `agents/${role}.md`)];
  for (const file of required) {
    if (typeof templates[file] !== "string" || !templates[file].trim()) throw new Error(`Codex bundle missing: ${file}`);
  }
  for (const file of ["CODEX.runbook.md", ...roles.map(role => `agents/${role}.md`)]) {
    const stub = stubOf(templates[file]);
    const markers = stub.match(/<!-- harness-runtime:[^>]+ -->/g) ?? [];
    if (markers.length !== 1 || markers[0] !== RUNTIME_MARKER) throw new Error(`Codex bundle protocol mismatch: ${file}`);
  }
  return templates;
}

import { createHash } from "node:crypto";

export const RUNBOOK_TEMPLATE = "CLAUDE.runbook.md";

export function runbookVersion(body) {
  return createHash("sha256").update(body).digest("hex").slice(0, 12);
}

export function codexRunbookVersion(body) {
  return runbookVersion(body.replace(/\r\n/g, "\n"));
}

export function isRunbookVersion(value) {
  return typeof value === "string" && /^[0-9a-f]{12}$/.test(value);
}

export function runbookIsStale(stored, bodies) {
  if (stored === null) return true;
  return !bodies.some((body) => runbookVersion(body) === stored);
}

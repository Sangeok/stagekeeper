import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { UUID, OID, gitText, json, keys, lstat, noLinks, readJson, refuse } from "./git-workspace.mjs";

const prefix = "refs/stagekeeper/pr-closeout/released/";
const scopeKey = /^[a-f0-9]{64}$/;

export function releaseRef(scope, task) {
  if (!(scope === "held" || scopeKey.test(scope)) || !UUID.test(task)) refuse("invalid-release-ref");
  return prefix + scope + "/" + task;
}

export function isReleaseRef(ref) {
  if (!ref.startsWith(prefix)) return false;
  const [scope, task, ...rest] = ref.slice(prefix.length).split("/");
  return !rest.length && (scope === "held" || scopeKey.test(scope)) && UUID.test(task);
}

export async function releaseRefs(ctx, { scope, task }) {
  if (scope !== undefined && !scopeKey.test(scope) || task !== undefined && !UUID.test(task)) refuse("invalid-release-ref");
  const pattern = prefix + (scope ?? "*") + "/" + (task ?? "*");
  const rows = await gitText(ctx, ["for-each-ref", "--count=10001", "--sort=refname", "--format=%(refname)%09%(objectname)%09%(symref)", pattern]);
  if (!rows) return [];
  const lines = rows.split("\n");
  if (lines.length > 10000) refuse("inventory-limit");
  return lines.map(line => {
    const [name, oid, symbolic, ...rest] = line.split("\t");
    if (!isReleaseRef(name) || !OID.test(oid) || rest.length || symbolic === undefined) refuse("release-ref-unverified");
    const [refScope, id] = name.slice(prefix.length).split("/");
    return { name, oid, scope: refScope, task: id, symbolic: Boolean(symbolic) };
  });
}

export function handoffStatus(stored, refs, scope) {
  const matches = refs.filter(ref => ref.oid === stored.oid);
  if (!matches.length) return refs.length ? "stale" : "absent";
  if (matches.length !== 1 || matches[0].symbolic || !stored.record.release) return "ambiguous";
  if (matches[0].scope === "held") return "held";
  return matches[0].scope === scope ? "active" : "foreign";
}

function cursorPath(ctx, scope) {
  if (!scopeKey.test(scope)) refuse("invalid-release-ref");
  return path.join(ctx.directory, "release-cursor-" + scope + ".json");
}

function readCursor(file) {
  if (!lstat(file)) return null;
  const cursor = readJson(file);
  if (!keys(cursor, ["last"]) || !UUID.test(cursor.last)) refuse("release-cursor-invalid");
  return cursor.last;
}

export function orderedCandidates(ctx, scope, refs) {
  const last = readCursor(cursorPath(ctx, scope));
  if (!last) return refs;
  const index = refs.findIndex(ref => ref.task > last);
  return index < 0 ? refs : [...refs.slice(index), ...refs.slice(0, index)];
}

export function recordCandidate(ctx, scope, task) {
  if (!UUID.test(task)) refuse("invalid-task");
  const file = cursorPath(ctx, scope);
  noLinks(file, true);
  readCursor(file);
  const temporary = file + "." + randomUUID();
  const fd = fs.openSync(temporary, "wx", 0o600);
  try {
    try { fs.writeFileSync(fd, json({ last: task })); }
    finally { fs.closeSync(fd); }
    fs.renameSync(temporary, file);
  } finally {
    if (lstat(temporary)) fs.unlinkSync(temporary);
  }
}

import fs from "node:fs";
import path from "node:path";
import { hostname } from "node:os";
import { randomUUID } from "node:crypto";
import { UUID, OID, ZERO, MAX_JSON, keys, object, json, digest, lstat, readJson, publishJson, mkdir, directoryIdentity, git, gitText, refuse, validateBranch } from "./git-workspace.mjs";

export const TASK_PREFIX = "refs/stagekeeper/pr-closeout/tasks/";
export const MIGRATION_REF = "refs/stagekeeper/pr-closeout/migration";
const phases = ["creating", "working", "sealed", "merge-requested", "merged", "cleanup-pending", "complete", "retired"];
const date = value => typeof value === "string" && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
const absolute = value => typeof value === "string" && path.isAbsolute(value) && path.resolve(value) === value && !value.includes("\0");
const hash = value => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
const nullable = (value, test) => value === null || test(value);
const recordKeys = ["schemaVersion", "kind", "taskId", "installationId", "instanceId", "owner", "commonGit", "repository", "origin", "branch", "path", "admin", "directory", "baseSha", "toolRevision", "sequence", "previousStateOid", "phase", "creation", "pr", "release", "purpose", "merge", "requests", "worktree", "branchEffect", "observation", "externalRemoval", "migration", "reasons"];

export function taskRef(id) { if (!UUID.test(id ?? "")) refuse("invalid-task"); return TASK_PREFIX + id; }
export function validTask(r, ctx) {
  if (!keys(r, recordKeys) || r.schemaVersion !== 1 || r.kind !== "task" || !UUID.test(r.taskId) || !UUID.test(r.installationId) || !UUID.test(r.instanceId)
    || typeof r.owner !== "string" || !r.owner || r.owner.length > 128 || /[\x00-\x1f\x7f]/.test(r.owner)
    || r.commonGit !== ctx.common || r.repository !== ctx.repository || r.origin !== ctx.origin || !absolute(r.path)
    || !nullable(r.admin, a => absolute(a) && path.dirname(a) === path.join(ctx.common, "worktrees"))
    || !OID.test(r.baseSha) || !OID.test(r.toolRevision) || !Number.isSafeInteger(r.sequence) || r.sequence < 1
    || !nullable(r.previousStateOid, v => OID.test(v)) || !phases.includes(r.phase)) return false;
  try { validateBranch(r.branch); } catch { return false; }
  if (!nullable(r.directory, v => keys(v, ["path", "device", "inode"]) && v.path === r.path && /^\d+$/.test(v.device) && /^\d+$/.test(v.inode))
    || !keys(r.creation, ["state", "at"]) || !["pending", "ready"].includes(r.creation.state) || !date(r.creation.at)
    || r.phase !== "creating" && (r.creation.state !== "ready" || !r.admin || !r.directory)) return false;
  if (!nullable(r.pr, v => keys(v, ["repositoryId", "number", "head", "branch", "base"]) && Number.isSafeInteger(v.repositoryId) && v.repositoryId > 0
    && Number.isSafeInteger(v.number) && v.number > 0 && OID.test(v.head) && v.branch === r.branch && v.base === "dev")) return false;
  if (!nullable(r.release, v => keys(v, ["head", "instance", "at", "fingerprint", "sourceState", "requestId"])
    && OID.test(v.head) && v.instance === r.instanceId && date(v.at) && hash(v.fingerprint) && OID.test(v.sourceState) && UUID.test(v.requestId))) return false;
  if (![null, "merged", "retire"].includes(r.purpose)
    || !nullable(r.merge, v => keys(v, ["head", "merge", "dev", "pr", "at", "check"]) && OID.test(v.head) && OID.test(v.merge) && OID.test(v.dev)
      && Number.isSafeInteger(v.pr) && v.pr > 0 && date(v.at) && nullable(v.check, c => keys(c, ["id", "attempt", "head", "conclusion"])
        && Number.isSafeInteger(c.id) && c.id > 0 && Number.isSafeInteger(c.attempt) && c.attempt > 0 && c.head === v.head && c.conclusion === "success"))) return false;
  if (!object(r.requests) || Object.keys(r.requests).length > 256 || Object.entries(r.requests).some(([id, v]) => !UUID.test(id)
    || !keys(v, ["operation", "signature", "expectedState", "outcome", "at"]) || !["complete", "cleanup", "retire", "acknowledge-removal"].includes(v.operation)
    || !hash(v.signature) || !OID.test(v.expectedState) || !["intent", "pending", "rejected", "complete"].includes(v.outcome) || !date(v.at))) return false;
  if (!keys(r.worktree, ["state", "requestId"]) || !["not-created", "present", "intent", "removed", "external"].includes(r.worktree.state)
    || !nullable(r.worktree.requestId, v => UUID.test(v)) || !keys(r.branchEffect, ["state", "requestId"])
    || !["not-started", "intent", "removed"].includes(r.branchEffect.state) || !nullable(r.branchEffect.requestId, v => UUID.test(v))) return false;
  if (!nullable(r.observation, v => keys(v, ["at", "status", "capability", "profile", "revision", "performed", "coverageComplete", "settled"])
    && date(v.at) && ["clear", "busy", "unknown"].includes(v.status) && ["qualified", "unqualified"].includes(v.capability)
    && nullable(v.profile, p => typeof p === "string" && p.length <= 128) && nullable(v.revision, p => OID.test(p))
    && [v.performed, v.coverageComplete, v.settled].every(b => typeof b === "boolean")) || !nullable(r.externalRemoval, v => keys(v, ["requestId", "head", "instance", "at"])
    && UUID.test(v.requestId) && OID.test(v.head) && v.instance === r.instanceId && date(v.at)) || !nullable(r.migration, v => keys(v, ["id", "sourceDigest", "sourceState"])
    && UUID.test(v.id) && hash(v.sourceDigest) && ["active", "closing"].includes(v.sourceState))) return false;
  if (!Array.isArray(r.reasons) || r.reasons.length > 32 || r.reasons.some(v => typeof v !== "string" || !/^[a-z][a-z0-9-]{0,79}$/.test(v))) return false;
  if (["sealed", "merge-requested", "merged", "cleanup-pending", "complete", "retired"].includes(r.phase) && !r.release) return false;
  if (["merged", "complete"].includes(r.phase) && (!r.merge || r.purpose !== "merged")) return false;
  if (r.purpose === "merged" && !r.merge || r.phase === "retired" && r.purpose !== "retire") return false;
  if (["complete", "retired"].includes(r.phase) && (!["removed", "external"].includes(r.worktree.state) || r.branchEffect.state !== "removed")) return false;
  if (r.worktree.state === "external" && !r.externalRemoval) return false;
  if (r.merge && (r.merge.head !== r.release?.head || r.merge.pr !== r.pr?.number) || r.pr && r.release && r.pr.head !== r.release.head) return false;
  if (r.externalRemoval && r.externalRemoval.head !== r.release?.head) return false;
  if (["intent", "removed", "external"].includes(r.worktree.state) && !r.worktree.requestId || r.branchEffect.state !== "not-started" && !r.branchEffect.requestId) return false;
  return true;
}
export function newTask(ctx, installationId, { taskId = randomUUID(), instanceId = randomUUID(), owner, branch, path: target, baseSha, toolRevision }) {
  return { schemaVersion: 1, kind: "task", taskId, installationId, instanceId, owner, commonGit: ctx.common, repository: ctx.repository,
    origin: ctx.origin, branch, path: target, admin: null, directory: null, baseSha, toolRevision, sequence: 1, previousStateOid: null,
    phase: "creating", creation: { state: "pending", at: new Date().toISOString() }, pr: null, release: null, purpose: null, merge: null,
    requests: {}, worktree: { state: "not-created", requestId: null }, branchEffect: { state: "not-started", requestId: null },
    observation: null, externalRemoval: null, migration: null, reasons: [] };
}
function permittedRef(ref) { return ref === MIGRATION_REF || ref.startsWith(TASK_PREFIX) && UUID.test(ref.slice(TASK_PREFIX.length)); }
export async function refOid(ctx, ref) {
  if (!permittedRef(ref)) refuse("invalid-state-ref");
  const result = await gitText(ctx, ["for-each-ref", "--format=%(refname)%09%(objectname)%09%(symref)", ref]);
  if (!result) return null;
  const rows = result.split("\n");
  if (rows.length !== 1) refuse("state-ref-unverified");
  const [name, oid, sym] = rows[0].split("\t");
  if (name !== ref || !OID.test(oid) || sym) refuse("state-ref-unverified");
  return oid;
}
export async function readStateObject(ctx, oid) {
  if (!OID.test(oid ?? "")) refuse("invalid-state");
  const size = Number(await gitText(ctx, ["cat-file", "-s", oid + ":state.json"]));
  if (!Number.isSafeInteger(size) || size > MAX_JSON || size < 2) refuse("state-too-large");
  let record;
  try { record = JSON.parse(await gitText(ctx, ["cat-file", "blob", oid + ":state.json"])); } catch { refuse("corrupt-state"); }
  const commit = await gitText(ctx, ["cat-file", "commit", oid]);
  const parents = commit.split("\n\n", 1)[0].split("\n").filter(v => v.startsWith("parent ")).map(v => v.slice(7));
  if (record.previousStateOid && parents[0] !== record.previousStateOid) refuse("state-lineage-invalid");
  return { oid, record, parents };
}
export async function loadTask(ctx, id) {
  const oid = await refOid(ctx, taskRef(id)); if (!oid) refuse("task-missing");
  const stored = await readStateObject(ctx, oid);
  if (!validTask(stored.record, ctx) || stored.record.taskId !== id) refuse("corrupt-state");
  return { oid, record: stored.record };
}
export async function listTasks(ctx) {
  const text = await gitText(ctx, ["for-each-ref", "--format=%(refname)", TASK_PREFIX]);
  const refs = text ? text.split("\n") : [];
  if (refs.length > 10000) refuse("inventory-limit");
  const tasks = [];
  let bytes = 0;
  for (const ref of refs) {
    if (!ref.startsWith(TASK_PREFIX) || !UUID.test(ref.slice(TASK_PREFIX.length))) refuse("corrupt-state");
    const task = await loadTask(ctx, ref.slice(TASK_PREFIX.length));
    bytes += Buffer.byteLength(json(task.record));
    if (bytes > 32 * MAX_JSON) refuse("inventory-limit");
    tasks.push(task);
  }
  return tasks;
}
export async function stateObject(ctx, record, parents = []) {
  const data = json(record);
  if (Buffer.byteLength(data) > MAX_JSON) refuse("state-too-large");
  const unique = [...new Set(parents.filter(Boolean))];
  if (unique.length > 32 || unique.some(p => !OID.test(p))) refuse("invalid-state-parents");
  const blob = await gitText(ctx, ["hash-object", "-w", "--stdin"], { input: data });
  const tree = await gitText(ctx, ["mktree"], { input: "100644 blob " + blob + "\tstate.json\n" });
  const env = { ...ctx.env, GIT_AUTHOR_NAME: "Stagekeeper state", GIT_AUTHOR_EMAIL: "state@localhost",
    GIT_COMMITTER_NAME: "Stagekeeper state", GIT_COMMITTER_EMAIL: "state@localhost" };
  return gitText(ctx, ["commit-tree", tree, ...unique.flatMap(p => ["-p", p]), "-F", "-"], { input: "Stagekeeper local state\n", env });
}
export async function transaction(ctx, changes) {
  assertGuard(ctx, "common");
  const names = new Set();
  let input = "start\n";
  for (const c of changes) {
    if (names.has(c.ref) || !OID.test(c.old ?? ZERO) || c.next !== null && !OID.test(c.next)) refuse("invalid-transaction");
    names.add(c.ref);
    if (c.ref.startsWith("refs/heads/")) {
      validateBranch(c.ref.slice(11)); if (c.next !== null || !c.old) refuse("invalid-branch-effect");
    } else if (!permittedRef(c.ref)) refuse("invalid-state-ref");
    input += c.next === null ? "delete " + c.ref + " " + c.old + "\n" : "update " + c.ref + " " + c.next + " " + (c.old ?? ZERO) + "\n";
  }
  input += "prepare\ncommit\n";
  const r = await git(ctx, ["update-ref", "--no-deref", "--stdin"], { input, allowed: [0, 128], diagnostics: true });
  if (r.status !== 0) refuse("state-changed");
}
export async function saveTask(ctx, stored, change, { deleteBranch = false } = {}) {
  assertGuard(ctx, "task", stored.record.taskId); assertGuard(ctx, "common");
  const next = { ...structuredClone(stored.record), ...change, sequence: stored.record.sequence + 1, previousStateOid: stored.oid };
  if (!validTask(next, ctx)) refuse("invalid-state-transition", 1);
  const oid = await stateObject(ctx, next, [stored.oid, next.baseSha, next.release?.head, next.merge?.merge, next.toolRevision]);
  const changes = [{ ref: taskRef(next.taskId), old: stored.oid, next: oid }];
  if (deleteBranch) changes.push({ ref: "refs/heads/" + next.branch, old: next.release.head, next: null });
  await transaction(ctx, changes);
  stored.record = next; stored.oid = oid; return stored;
}
export async function createTaskRecord(ctx, record) {
  if (!validTask(record, ctx)) refuse("invalid-state-transition", 1);
  const oid = await stateObject(ctx, record, [record.baseSha, record.toolRevision]);
  await transaction(ctx, [{ ref: taskRef(record.taskId), old: null, next: oid }]); return { oid, record };
}
export function initializeMetadata(ctx) {
  mkdir(ctx.directory);
  for (const name of ["guards", "retired-guards", "empty-hooks"]) mkdir(path.join(ctx.directory, name));
  if (fs.readdirSync(ctx.hooks).length) refuse("unsafe-hooks");
}
function guardPath(ctx, kind, id) {
  if (!["common", "task", "migration"].includes(kind) || kind === "task" && !UUID.test(id ?? "") || kind !== "task" && id !== undefined) refuse("invalid-guard");
  return path.join(ctx.directory, "guards", kind === "task" ? "task-" + id : kind);
}
function guardOwner(file) {
  const value = readJson(path.join(file, "owner.json"));
  if (!keys(value, ["schemaVersion", "nonce", "host", "pid", "kind", "taskId", "createdAt"])
    || value.schemaVersion !== 1 || !UUID.test(value.nonce) || typeof value.host !== "string"
    || !Number.isSafeInteger(value.pid) || value.pid < 1 || !["common", "task", "migration"].includes(value.kind)
    || !nullable(value.taskId, v => UUID.test(v)) || !date(value.createdAt)) refuse("guard-unverified");
  return value;
}
export function guardStatus(ctx, kind, id) {
  const file = guardPath(ctx, kind, id);
  if (!lstat(file)) return { state: "absent", nonce: null };
  try {
    const owner = guardOwner(file); let state = "unknown";
    if (owner.kind !== kind || owner.taskId !== (id ?? null)) return { state: "unknown", nonce: null };
    if (owner.host === hostname()) { try { process.kill(owner.pid, 0); state = "live"; } catch (e) { if (e.code === "ESRCH") state = "dead"; } }
    return { ...owner, state };
  } catch { return { state: "unknown", nonce: null }; }
}
export function acquireGuard(ctx, kind, id) {
  initializeMetadata(ctx); const file = guardPath(ctx, kind, id);
  try { fs.mkdirSync(file, { mode: 0o700 }); } catch (e) { if (e.code === "EEXIST") refuse("guard-held"); refuse("guard-write-failed", 1); }
  const owner = { schemaVersion: 1, nonce: randomUUID(), host: hostname(), pid: process.pid, kind, taskId: id ?? null, createdAt: new Date().toISOString() };
  publishJson(path.join(file, "owner.json"), owner);
  const handle = { file, owner, identity: directoryIdentity(file) };
  ctx.guards.set(file, handle); return handle;
}
export function assertGuard(ctx, kind, id) {
  const file = guardPath(ctx, kind, id), handle = ctx.guards.get(file);
  if (ctx.signal?.aborted) refuse("cancelled");
  if (!handle || ctx.unsettled || json(directoryIdentity(file)) !== json(handle.identity) || json(guardOwner(file)) !== json(handle.owner)) refuse("guard-changed");
}
export function releaseGuard(ctx, handle) {
  if (!handle || ctx.unsettled || ctx.children.size) return;
  assertGuard({ ...ctx, signal: undefined }, handle.owner.kind, handle.owner.taskId ?? undefined);
  if (fs.readdirSync(handle.file).some(v => v !== "owner.json")) refuse("guard-unverified");
  fs.unlinkSync(path.join(handle.file, "owner.json")); fs.rmdirSync(handle.file); ctx.guards.delete(handle.file);
}
export async function withGuard(ctx, kind, id, fn) {
  const handle = acquireGuard(ctx, kind, id);
  try { return await fn(); } finally { releaseGuard(ctx, handle); }
}
export async function recoverGuard(ctx, kind, id, nonce, confirmed) {
  const status = guardStatus(ctx, kind, id);
  if (!nonce) return status;
  if (!confirmed || status.state !== "dead" || status.nonce !== nonce) refuse("guard-recovery-refused");
  const file = guardPath(ctx, kind, id), original = directoryIdentity(file), owner = guardOwner(file);
  initializeMetadata(ctx);
  if (json(directoryIdentity(file)) !== json(original) || json(guardOwner(file)) !== json(owner)) refuse("guard-changed");
  const archive = path.join(ctx.directory, "retired-guards", nonce);
  if (lstat(archive)) refuse("guard-recovery-conflict");
  fs.renameSync(file, archive); return { ...status, state: "retired" };
}
export async function activation(ctx) {
  const marker = path.join(ctx.directory, "activation.json"), oid = await refOid(ctx, MIGRATION_REF);
  if (!lstat(marker)) return { active: false, reason: oid ? "migration-pending" : "activation-required" };
  const value = readJson(marker);
  if (!keys(value, ["schemaVersion", "installationId", "migrationId", "appliedOid", "fenceNonce"]) || value.schemaVersion !== 1
    || !UUID.test(value.installationId) || !UUID.test(value.migrationId) || !UUID.test(value.fenceNonce) || value.appliedOid !== oid) refuse("activation-unverified");
  const { record } = await readStateObject(ctx, oid);
  if (record.kind !== "migration" || record.phase !== "applied" || record.installationId !== value.installationId
    || record.migrationId !== value.migrationId || record.fence.nonce !== value.fenceNonce) refuse("activation-unverified");
  const fence = readJson(path.join(ctx.common, "stagekeeper-task-worktrees", "command.guard", "owner.json"));
  if (json(fence) !== json(record.fence.owner)) refuse("activation-unverified");
  return { active: true, ...value, journal: record };
}
export async function requireActivation(ctx) { const a = await activation(ctx); if (!a.active) refuse(a.reason); return a; }
export function markerFor(record) {
  return { schemaVersion: 1, installationId: record.installationId, taskId: record.taskId, instanceId: record.instanceId };
}
export function requestSignature(options) {
  const semantic = Object.fromEntries(Object.entries(options).filter(([key]) => !["root", "signal"].includes(key)));
  return digest(json(semantic));
}
export function authorize(stored, options) {
  const r = stored.record;
  if (r.owner !== options.owner) refuse("owner-mismatch");
  const existing = options.requestId && r.requests[options.requestId];
  if (existing && existing.signature !== requestSignature(options)) refuse("request-conflict");
  if (stored.oid !== options.expectedState && !(existing && existing.expectedState === options.expectedState)) refuse("stale-state");
  if (options.expectedInstance !== undefined && options.expectedInstance !== r.instanceId) refuse("identity-changed");
  if (r.release && options.expectedHead !== undefined && r.release.head !== options.expectedHead) refuse("head-changed");
  return existing;
}
export function requestChange(stored, options, outcome) {
  const requests = { ...stored.record.requests };
  if (!requests[options.requestId] && Object.keys(requests).length >= 256) refuse("request-history-limit");
  requests[options.requestId] = { operation: options.operation, signature: requestSignature(options), expectedState: options.expectedState, outcome, at: new Date().toISOString() };
  return requests;
}

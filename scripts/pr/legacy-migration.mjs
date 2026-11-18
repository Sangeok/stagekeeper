import fs from "node:fs";
import path from "node:path";
import { hostname } from "node:os";
import { randomUUID } from "node:crypto";
import { UUID, OID, MAX_JSON, MARKER, keys, object, json, digest, lstat, noLinks, readJson, publishJson, mkdir, directoryIdentity, worktreeState, refuse, validateBranch } from "./git-workspace.mjs";
import { MIGRATION_REF, activation, refOid, readStateObject, newTask, validTask, stateObject, transaction, withGuard, markerFor, taskRef } from "./task-state.mjs";

const legacyKeys = ["schemaVersion", "taskId", "instanceId", "revision", "owner", "commonGit", "path", "gitDir", "branch", "baseSha", "state", "createdAt", "removedAt", "closing", "removalStartedAt", "branchCleanup", "lastReasons"];
const validDate = v => typeof v === "string" && Number.isFinite(Date.parse(v)) && new Date(v).toISOString() === v;
const hash = v => typeof v === "string" && /^[a-f0-9]{64}$/.test(v);
function bounded(value) { if (Buffer.byteLength(json(value)) > MAX_JSON) refuse("plan-too-large"); return value; }
function legacyRoot(ctx) { return path.join(ctx.common, "stagekeeper-task-worktrees"); }
function fencePath(ctx) { return path.join(legacyRoot(ctx), "command.guard"); }
function validLegacyBranchResult(value, record) {
  const code = v => typeof v === "string" && /^[a-z][a-z0-9-]{0,79}$/.test(v);
  if (typeof value === "string") return ["branch-missing", "branch-changed", "branch-in-use", "branch-inspection-failed", "invalid-branch-result"].includes(value);
  if (!keys(value, ["apply", "aborted", "results", "summary"]) || value.apply !== true || typeof value.aborted !== "boolean"
    || !Array.isArray(value.results) || value.results.length !== 1) return false;
  const item = value.results[0];
  if (!object(item) || Object.keys(item).some(k => !["branch", "sha", "status", "preservation", "worktrees", "reasons", "reason", "devSha", "pr", "note"].includes(k))
    || item.branch !== record.branch || !["deleted", "skipped"].includes(item.status) || !["ancestor", "merged-pr", "unverified"].includes(item.preservation)
    || !Array.isArray(item.reasons) || !item.reasons.every(code) || !Array.isArray(item.worktrees)
    || item.sha !== undefined && item.sha !== record.closing.headSha || item.devSha !== undefined && !OID.test(item.devSha)
    || item.pr !== undefined && (!Number.isSafeInteger(item.pr) || item.pr < 1) || item.note !== undefined && item.note !== "branch-config-absent-or-retained") return false;
  if (item.worktrees.some(w => !keys(w, ["path", "head", "locked", "prunable", "changes"]) || typeof w.path !== "string" || !w.path
    || w.head !== null && !OID.test(w.head) || typeof w.locked !== "boolean" || typeof w.prunable !== "boolean" || !["clean", "dirty", "unknown"].includes(w.changes))) return false;
  if (item.status === "skipped" && (!item.reasons.length || item.reason !== item.reasons[0])
    || item.status === "deleted" && (item.reasons.length || item.reason !== undefined || !OID.test(item.sha) || item.preservation === "unverified")) return false;
  const expected = { total: 1, ancestor: Number(item.preservation === "ancestor"), mergedPr: Number(item.preservation === "merged-pr"), unverified: Number(item.preservation === "unverified"),
    worktreeInUse: Number(item.reasons.includes("worktree-in-use")), eligible: 0, deleted: Number(item.status === "deleted"), skipped: Number(item.status === "skipped") };
  return keys(value.summary, Object.keys(expected)) && Object.keys(expected).every(k => value.summary[k] === expected[k]);
}
function validLegacy(r, ctx, id) {
  if (!keys(r, legacyKeys) || r.schemaVersion !== 1 || r.taskId !== id || !UUID.test(id) || !UUID.test(r.instanceId)
    || !Number.isSafeInteger(r.revision) || r.revision < 1 || r.commonGit !== ctx.common || !OID.test(r.baseSha)
    || typeof r.owner !== "string" || !r.owner || r.owner.trim() !== r.owner || r.owner.length > 128 || /[\x00-\x1f\x7f]/.test(r.owner)
    || typeof r.path !== "string" || !path.isAbsolute(r.path) || path.resolve(r.path) !== r.path
    || !["creating", "active", "closing", "removed"].includes(r.state) || !validDate(r.createdAt)
    || r.gitDir !== null && (typeof r.gitDir !== "string" || path.dirname(r.gitDir) !== path.join(ctx.common, "worktrees"))
    || r.state !== "creating" && !r.gitDir || !Array.isArray(r.lastReasons) || r.lastReasons.length > 32
    || r.lastReasons.some(v => typeof v !== "string" || !/^[a-z][a-z0-9-]{0,79}$/.test(v))) return false;
  try { validateBranch(r.branch); } catch { return false; }
  if ((r.state === "removed" ? !validDate(r.removedAt) : r.removedAt !== null) || r.removalStartedAt !== null && !validDate(r.removalStartedAt)) return false;
  if (["creating", "active"].includes(r.state)) { if (r.closing !== null || r.removalStartedAt !== null) return false; }
  else {
    const c = r.closing, p = c?.preservation;
    if (!keys(c, ["headSha", "requestedAt", "sourceRevision", "fileFingerprint", "preservation", "usageEnded"]) || !OID.test(c.headSha)
      || !validDate(c.requestedAt) || !Number.isSafeInteger(c.sourceRevision) || c.sourceRevision < 1 || c.sourceRevision >= r.revision
      || !hash(c.fileFingerprint) || c.usageEnded !== true || !object(p) || !["remote-head", "ancestor", "merged-pr"].includes(p.kind)
      || !keys(p, ["kind", "headSha", "devSha", "checkedAt", ...(p.kind === "merged-pr" ? ["pr", "mergeSha"] : [])])
      || p.headSha !== c.headSha || !OID.test(p.devSha) || !validDate(p.checkedAt)
      || p.kind === "merged-pr" && (!Number.isSafeInteger(p.pr) || p.pr < 1 || !OID.test(p.mergeSha))) return false;
  }
  const b = r.branchCleanup;
  if (!keys(b, ["state", "headSha", "result"]) || !["not-started", "attempted", "finished"].includes(b.state)
    || b.headSha !== (r.closing?.headSha ?? null) || b.state !== "not-started" && r.state !== "removed"
    || b.state !== "finished" && b.result !== null || b.state === "finished" && !validLegacyBranchResult(b.result, r)) return false;
  return true;
}
async function sourceSnapshot(ctx) {
  const directory = path.join(legacyRoot(ctx), "tasks"), rows = [], reasons = [];
  noLinks(directory, true);
  if (!lstat(directory)) return { rows, reasons, digest: digest(json(rows)) };
  if (!lstat(directory).isDirectory()) refuse("legacy-corrupt");
  const names = fs.readdirSync(directory).sort();
  if (names.length > 10000) refuse("inventory-limit");
  for (const name of names) {
    if (/^\.tmp-[a-f0-9-]+$/.test(name)) { reasons.push("legacy-temporary-file"); continue; }
    const id = name.endsWith(".json") ? name.slice(0, -5) : "";
    if (!UUID.test(id)) refuse("legacy-corrupt");
    const record = readJson(path.join(directory, name));
    if (!validLegacy(record, ctx, id)) refuse("legacy-corrupt");
    const row = { taskId: id, instanceId: record.instanceId, owner: record.owner, branch: record.branch, path: record.path,
      admin: record.gitDir, baseSha: record.baseSha, sourceState: record.state, revision: record.revision,
      recordDigest: digest(json(record)), markerDigest: null, head: null, directory: null };
    if (record.state === "creating") reasons.push("legacy-creating");
    else if (record.state !== "removed") {
      if (record.removalStartedAt) reasons.push("legacy-removal-started");
      const marker = readJson(path.join(record.gitDir, "stagekeeper-task.json"));
      if (!keys(marker, ["schemaVersion", "taskId", "instanceId"]) || marker.schemaVersion !== 1 || marker.taskId !== id || marker.instanceId !== record.instanceId) refuse("legacy-marker-invalid");
      const identity = await worktreeState(ctx, { ...row, directory: null }, { marker: false });
      if (!identity.present) refuse("legacy-instance-missing");
      row.markerDigest = digest(json(marker)); row.head = identity.head; row.directory = identity.directory;
    }
    rows.push(row); bounded(rows);
  }
  const active = rows.filter(r => ["active", "closing"].includes(r.sourceState));
  if (new Set(active.map(r => r.branch)).size !== active.length || new Set(active.map(r => r.path)).size !== active.length) refuse("legacy-identity-conflict");
  return { rows, reasons: [...new Set(reasons)], digest: digest(json(rows)) };
}
export async function migrationPreview(ctx, toolRevision) {
  const source = await sourceSnapshot(ctx);
  const reasons = [...source.reasons];
  if (lstat(fencePath(ctx))) reasons.push("legacy-guard-present");
  return bounded({ schemaVersion: 1, kind: "migration-plan", planId: randomUUID(), commonGit: ctx.common, repository: ctx.repository,
    origin: ctx.origin, toolRevision, sourceDigest: source.digest, rows: source.rows, reasons,
    owners: [...new Set(source.rows.filter(r => ["active", "closing"].includes(r.sourceState)).map(r => r.owner))].sort() });
}
function validatePlan(plan, ctx) {
  if (!keys(plan, ["schemaVersion", "kind", "planId", "commonGit", "repository", "origin", "toolRevision", "sourceDigest", "rows", "reasons", "owners"])
    || plan.schemaVersion !== 1 || plan.kind !== "migration-plan" || !UUID.test(plan.planId) || plan.commonGit !== ctx.common
    || plan.repository !== ctx.repository || plan.origin !== ctx.origin || !OID.test(plan.toolRevision) || !hash(plan.sourceDigest)
    || !Array.isArray(plan.rows) || !Array.isArray(plan.reasons) || plan.reasons.length || !Array.isArray(plan.owners)
    || digest(json(plan.rows)) !== plan.sourceDigest) refuse("migration-plan-invalid");
  bounded(plan);
}
export function validJournal(r, ctx) {
  if (!object(r) || !Array.isArray(r.manifest) || !Array.isArray(r.plan?.rows)) return false;
  if (new Set(r.manifest.map(m => m.taskId)).size !== r.manifest.length) return false;
  if (["prepared", "applied"].includes(r.phase)) {
    const active = r.plan.rows.filter(row => ["active", "closing"].includes(row.sourceState));
    if (active.length !== r.manifest.length || active.some(row => !r.manifest.some(m => m.taskId === row.taskId && m.admin === row.admin && m.marker?.instanceId === row.instanceId))) return false;
  }
  return keys(r, ["schemaVersion", "kind", "migrationId", "installationId", "commonGit", "repository", "origin", "planDigest", "plan", "phase",
    "previousStateOid", "fence", "manifest", "pin", "abort"])
    && r.schemaVersion === 1 && r.kind === "migration" && UUID.test(r.migrationId) && UUID.test(r.installationId)
    && r.commonGit === ctx.common && r.repository === ctx.repository && r.origin === ctx.origin && hash(r.planDigest)
    && (r.previousStateOid === null || OID.test(r.previousStateOid)) && ["preparing", "prepared", "applied", "aborting", "aborted"].includes(r.phase)
    && object(r.plan) && digest(json(r.plan)) === r.planDigest && r.plan.planId === r.migrationId
    && keys(r.fence, ["nonce", "owner"]) && UUID.test(r.fence.nonce) && keys(r.fence.owner, ["schemaVersion", "nonce", "host", "pid", "operation", "migrationId", "installationId", "createdAt"])
    && r.fence.owner.schemaVersion === 2 && r.fence.owner.nonce === r.fence.nonce && r.fence.owner.migrationId === r.migrationId
    && r.fence.owner.installationId === r.installationId && r.fence.owner.operation === "pr-closeout-migration"
    && typeof r.fence.owner.host === "string" && Number.isSafeInteger(r.fence.owner.pid) && r.fence.owner.pid > 0 && validDate(r.fence.owner.createdAt)
    && Array.isArray(r.manifest) && r.manifest.every(m => keys(m, ["taskId", "oid", "marker", "admin"]) && UUID.test(m.taskId) && OID.test(m.oid)
      && typeof m.admin === "string" && path.dirname(m.admin) === path.join(ctx.common, "worktrees")
      && keys(m.marker, ["schemaVersion", "installationId", "taskId", "instanceId"]) && m.marker.schemaVersion === 1
      && m.marker.installationId === r.installationId && m.marker.taskId === m.taskId && UUID.test(m.marker.instanceId))
    && (r.pin === null || OID.test(r.pin)) && (r.abort === null || keys(r.abort, ["identity", "ownerDigest"]) && object(r.abort.identity) && hash(r.abort.ownerDigest));
}
async function journal(ctx) {
  const oid = await refOid(ctx, MIGRATION_REF);
  if (!oid) return null;
  const value = await readStateObject(ctx, oid);
  if (!validJournal(value.record, ctx)) refuse("migration-journal-invalid");
  validatePlan(value.record.plan, ctx);
  return { oid, record: value.record };
}
async function saveJournal(ctx, stored, change, changes = []) {
  const record = { ...stored.record, ...change, previousStateOid: stored.oid };
  if (!validJournal(record, ctx)) refuse("migration-journal-invalid");
  const oid = await stateObject(ctx, record, [stored.oid, record.pin]);
  await transaction(ctx, [...changes, { ref: MIGRATION_REF, old: stored.oid, next: oid }]);
  stored.oid = oid; stored.record = record;
}
function verifyFence(ctx, stored) {
  const value = readJson(path.join(fencePath(ctx), "owner.json"));
  if (json(value) !== json(stored.record.fence.owner) || fs.readdirSync(fencePath(ctx)).some(n => n !== "owner.json")) refuse("fence-unverified");
  return directoryIdentity(fencePath(ctx));
}
async function verifySource(ctx, plan) {
  const source = await sourceSnapshot(ctx);
  if (source.reasons.length || source.digest !== plan.sourceDigest || json(source.rows) !== json(plan.rows)) refuse("migration-source-changed");
}
export async function pinStates(ctx, oids) {
  let level = [...oids];
  while (level.length > 1) {
    const next = [];
    for (let i = 0; i < level.length; i += 32) next.push(await stateObject(ctx, { schemaVersion: 1, kind: "pin" }, level.slice(i, i + 32)));
    level = next;
  }
  return level[0] ?? null;
}
async function finishMigration(ctx, stored) {
  if (stored.record.phase === "aborted" || stored.record.phase === "aborting") refuse("migration-aborted");
  if (stored.record.phase === "preparing") {
    if (!lstat(fencePath(ctx))) {
      await verifySource(ctx, stored.record.plan);
      mkdir(legacyRoot(ctx));
      try { fs.mkdirSync(fencePath(ctx), { mode: 0o700 }); } catch { refuse("fence-unverified"); }
      publishJson(path.join(fencePath(ctx), "owner.json"), stored.record.fence.owner);
    }
    verifyFence(ctx, stored);
    await withGuard(ctx, "common", undefined, async () => {
      if (await refOid(ctx, MIGRATION_REF) !== stored.oid) refuse("migration-state-changed");
      await verifySource(ctx, stored.record.plan);
      const manifest = [];
      for (const row of stored.record.plan.rows.filter(r => ["active", "closing"].includes(r.sourceState))) {
        if (await refOid(ctx, taskRef(row.taskId))) refuse("migration-task-conflict");
        const record = newTask(ctx, stored.record.installationId, { ...row, toolRevision: stored.record.plan.toolRevision });
        Object.assign(record, { admin: row.admin, directory: row.directory, phase: "working", creation: { state: "ready", at: record.creation.at },
          worktree: { state: "present", requestId: null }, migration: { id: stored.record.migrationId, sourceDigest: stored.record.plan.sourceDigest, sourceState: row.sourceState } });
        if (!validTask(record, ctx)) refuse("migration-record-invalid");
        const oid = await stateObject(ctx, record, [record.baseSha, row.head, record.toolRevision]);
        manifest.push({ taskId: row.taskId, oid, marker: markerFor(record), admin: row.admin }); bounded(manifest);
      }
      const pin = await pinStates(ctx, manifest.map(m => m.oid));
      await saveJournal(ctx, stored, { phase: "prepared", manifest, pin });
    });
  }
  verifyFence(ctx, stored);
  if (stored.record.phase === "prepared") {
    await withGuard(ctx, "common", undefined, async () => {
      if (await refOid(ctx, MIGRATION_REF) !== stored.oid) refuse("migration-state-changed");
      await verifySource(ctx, stored.record.plan);
      for (const m of stored.record.manifest) {
        if (await refOid(ctx, taskRef(m.taskId))) refuse("migration-task-conflict");
        publishJson(path.join(m.admin, MARKER), m.marker);
        if (json(readJson(path.join(m.admin, MARKER))) !== json(m.marker)) refuse("migration-marker-invalid");
      }
      await saveJournal(ctx, stored, { phase: "applied" }, stored.record.manifest.map(m => ({ ref: taskRef(m.taskId), old: null, next: m.oid })));
    });
  }
  return withGuard(ctx, "common", undefined, async () => {
    verifyFence(ctx, stored);
    if (await refOid(ctx, MIGRATION_REF) !== stored.oid) refuse("migration-state-changed");
    for (const m of stored.record.manifest) {
      if (await refOid(ctx, taskRef(m.taskId)) !== m.oid || json(readJson(path.join(m.admin, MARKER))) !== json(m.marker)) refuse("migration-publication-incomplete");
    }
    const marker = { schemaVersion: 1, installationId: stored.record.installationId, migrationId: stored.record.migrationId, appliedOid: stored.oid, fenceNonce: stored.record.fence.nonce };
    publishJson(path.join(ctx.directory, "activation.json"), marker);
    return { state: stored.oid, phase: "applied", installationId: marker.installationId, reason: "activated" };
  });
}
async function abortMigration(ctx, stored) {
  if (stored.record.phase === "applied") refuse("migration-forward-only");
  if (stored.record.phase === "aborted") return { state: stored.oid, phase: "aborted" };
  for (const m of stored.record.manifest) if (lstat(path.join(m.admin, MARKER)) || await refOid(ctx, taskRef(m.taskId))) refuse("migration-forward-only");
  return withGuard(ctx, "common", undefined, async () => {
    if (await refOid(ctx, MIGRATION_REF) !== stored.oid) refuse("migration-state-changed");
    if (stored.record.phase !== "aborting") {
      const identity = lstat(fencePath(ctx)) ? verifyFence(ctx, stored) : null;
      await saveJournal(ctx, stored, { phase: "aborting", abort: identity ? { identity, ownerDigest: digest(json(stored.record.fence.owner)) } : null });
    }
    if (lstat(fencePath(ctx))) {
      const receipt = stored.record.abort;
      if (!receipt || json(directoryIdentity(fencePath(ctx))) !== json(receipt.identity)) refuse("fence-unverified");
      const ownerFile = path.join(fencePath(ctx), "owner.json");
      if (lstat(ownerFile)) {
        if (digest(json(readJson(ownerFile))) !== receipt.ownerDigest || fs.readdirSync(fencePath(ctx)).length !== 1) refuse("fence-unverified");
        fs.unlinkSync(ownerFile);
      }
      if (fs.readdirSync(fencePath(ctx)).length) refuse("fence-unverified");
      fs.rmdirSync(fencePath(ctx));
    }
    await saveJournal(ctx, stored, { phase: "aborted" });
    return { state: stored.oid, phase: "aborted" };
  });
}
export async function migrate(ctx, options, toolRevision) {
  if (options.action === "preview") return migrationPreview(ctx, toolRevision);
  const plan = readJson(options.plan); validatePlan(plan, ctx);
  if (digest(json(plan)) !== options.expectedPlanDigest) refuse("migration-plan-changed");
  const active = await activation(ctx);
  if (active.active) {
    if (active.journal.planDigest !== options.expectedPlanDigest) refuse("already-active-different-plan");
    return { state: active.appliedOid, phase: "applied", reason: "already-active" };
  }
  if (plan.toolRevision !== toolRevision) refuse("migration-tool-changed");
  if (!options.writersQuiescent || !options.ownersConfirmed) refuse("migration-handoff-required");
  return withGuard(ctx, "migration", undefined, async () => {
    let stored = await journal(ctx);
    if ((stored?.oid ?? "absent") !== options.expectedMigrationState) refuse("migration-state-changed");
    if (!stored || stored.record.phase === "aborted" && options.action === "apply") {
      if (options.action !== "apply") refuse("migration-missing");
      const oldOid = stored?.oid ?? null;
      await withGuard(ctx, "common", undefined, async () => {
        if (await refOid(ctx, MIGRATION_REF) !== oldOid) refuse("migration-state-changed");
        if (lstat(fencePath(ctx))) refuse("fence-unverified");
        await verifySource(ctx, plan);
        const nonce = randomUUID(), installationId = randomUUID();
        const record = { schemaVersion: 1, kind: "migration", migrationId: plan.planId, installationId, commonGit: ctx.common,
          repository: ctx.repository, origin: ctx.origin, planDigest: options.expectedPlanDigest, plan, phase: "preparing", previousStateOid: oldOid,
          fence: { nonce, owner: { schemaVersion: 2, nonce, host: hostname(), pid: process.pid, operation: "pr-closeout-migration",
            migrationId: plan.planId, installationId, createdAt: new Date().toISOString() } }, manifest: [], pin: null, abort: null };
        const oid = await stateObject(ctx, record, [oldOid]);
        await transaction(ctx, [{ ref: MIGRATION_REF, old: oldOid, next: oid }]);
        stored = { oid, record };
        if ((await journal(ctx)).oid !== oid) refuse("migration-state-changed");
      });
    } else if (stored.record.planDigest !== options.expectedPlanDigest) refuse("migration-plan-changed");
    return options.action === "abort" ? abortMigration(ctx, stored) : finishMigration(ctx, stored);
  });
}

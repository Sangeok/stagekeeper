import path from "node:path";
import { fileURLToPath } from "node:url";
import { UUID, OID, MARKER, PrFailure, refuse, object, json, digest, lstat, noLinks, publishJson, canonical, git, gitText, context, branchHead, worktreeState, directoryIdentity, inspectFiles, checkNewPath, remoteSnapshot, ancestor, validateBranch } from "./git-workspace.mjs";
import { MIGRATION_REF, activation, requireActivation, loadTask, listTasks, readStateObject, refOid, taskRef, newTask, createTaskRecord, saveTask, withGuard, assertGuard, guardStatus, recoverGuard, markerFor, authorize, requestChange } from "./task-state.mjs";
import { migrate, validJournal, installationTask } from "./legacy-migration.mjs";
import { pull, preflight, requestMerge, observeMerge, mergeProof, preservation, noOpenDependencies } from "./github-merge.mjs";
import { change, recordMerged, currentHead, seal, terminal, cleanup, handoff } from "./task-closeout.mjs";
import { attachResumedLink, cleanupBeforeStart, inspectHandoff, releaseTask } from "./task-handoff.mjs";

const common = ["operation", "root", "signal"];
const task = ["task", "owner", "expectedState"];
const effect = ["expectedHead", "expectedInstance", "requestId"];
const contract = {
  status: ["task"], inspect: ["task", "pr", "remote"],
  start: ["owner", "branch", "path"], release: [...task, ...effect, "pr", "usageEnded"],
  create: ["owner", "branch", "path", "task", "expectedState", "confirmCreatedByTask"],
  complete: [...task, ...effect, "pr", "usageEnded"], cleanup: [...task, ...effect],
  retire: [...task, ...effect, "pr", "usageEnded"], recover: task, resume: task,
  "acknowledge-removal": [...task, ...effect, "externalRemovalConfirmed"],
  "recover-guard": ["guard", "task", "expectedNonce", "confirmedQuiescent"],
  migrate: ["action", "plan", "expectedPlanDigest", "expectedMigrationState", "writersQuiescent", "ownersConfirmed"],
};
const booleans = new Set(["remote", "confirmCreatedByTask", "usageEnded", "externalRemovalConfirmed", "confirmedQuiescent", "writersQuiescent", "ownersConfirmed"]);
export function validateOptions(options) {
  if (!object(options) || !Object.hasOwn(contract, options.operation) || Object.keys(options).some(k => ![...common, ...contract[options.operation]].includes(k))) refuse("invalid-input");
  if (options.signal !== undefined && !(options.signal instanceof AbortSignal)) refuse("invalid-input");
  for (const [key, value] of Object.entries(options)) {
    if (booleans.has(key) && value !== true || key !== "signal" && key !== "pr" && !booleans.has(key) && typeof value !== "string") refuse("invalid-input");
    if (typeof value === "string" && (value.includes("\0") || value.length > 4096)) refuse("invalid-input");
  }
  for (const key of ["task", "expectedInstance", "requestId", "expectedNonce"]) if (options[key] !== undefined && !UUID.test(options[key])) refuse("invalid-input");
  for (const key of ["expectedState", "expectedHead"]) if (options[key] !== undefined && !OID.test(options[key])) refuse("invalid-input");
  if (options.pr !== undefined && (!Number.isSafeInteger(options.pr) || options.pr < 1)) refuse("invalid-input");
  if (options.owner !== undefined && (!options.owner || options.owner.trim() !== options.owner || options.owner.length > 128 || /[\x00-\x1f\x7f]/.test(options.owner))) refuse("invalid-input");
  const newTaskRequest = options.operation === "start" || options.operation === "create" && !options.task;
  const required = newTaskRequest ? ["owner", "branch", "path"]
    : ["complete", "release", "cleanup", "retire", "acknowledge-removal"].includes(options.operation) ? [...task, ...effect]
      : ["create", "recover", "resume"].includes(options.operation) ? task : options.operation === "inspect" ? ["task"] : [];
  for (const key of required) if (options[key] === undefined) refuse("missing-" + key.replace(/[A-Z]/g, c => "-" + c.toLowerCase()));
  if (options.operation === "complete" && (!options.pr || !options.usageEnded) || ["release", "retire"].includes(options.operation) && !options.usageEnded
    || options.operation === "acknowledge-removal" && !options.externalRemovalConfirmed) refuse("handoff-required");
  if (["create", "start"].includes(options.operation)) {
    if (options.task ? options.branch !== undefined || options.path !== undefined : options.expectedState !== undefined || options.confirmCreatedByTask !== undefined) refuse("invalid-input");
    if (options.branch) validateBranch(options.branch);
    if (options.path && (!path.isAbsolute(options.path) || path.resolve(options.path) !== options.path)) refuse("invalid-input");
  }
  if (options.operation === "recover-guard") {
    if (!["common", "task", "migration"].includes(options.guard) || (options.guard === "task") !== Boolean(options.task)
      || Boolean(options.expectedNonce) !== Boolean(options.confirmedQuiescent)) refuse("invalid-input");
  }
  if (options.operation === "migrate") {
    if (!["preview", "apply", "recover", "abort"].includes(options.action)) refuse("invalid-input");
    if (options.action === "preview") {
      if (Object.keys(options).some(k => ![...common, "action"].includes(k))) refuse("invalid-input");
    } else if (!options.plan || !path.isAbsolute(options.plan) || !/^[a-f0-9]{64}$/.test(options.expectedPlanDigest ?? "")
      || !(OID.test(options.expectedMigrationState ?? "") || options.action === "apply" && options.expectedMigrationState === "absent")) refuse("invalid-input");
  }
  return options;
}
export function parseArgs(argv, namespace = "pr") {
  const operation = argv.shift();
  if (["start", "release"].includes(operation) !== (namespace === "task")) refuse("invalid-input");
  const options = { operation };
  if (operation === "migrate") options.action = argv.shift();
  while (argv.length) {
    const token = argv.shift();
    if (!/^--[a-z]+(?:-[a-z]+)*$/.test(token)) refuse("invalid-input");
    const key = token.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    if (Object.hasOwn(options, key)) refuse("duplicate-input");
    if (booleans.has(key)) options[key] = true;
    else {
      const value = argv.shift(); if (!value || value.startsWith("--")) refuse("invalid-input");
      options[key] = key === "pr" ? /^\d+$/.test(value) ? Number(value) : NaN : value;
    }
  }
  return validateOptions(options);
}
async function sourceRevision(ctx, mutation) {
  if (ctx.ports.sourceRevision) {
    const result = await ctx.ports.sourceRevision(ctx);
    if (!OID.test(result)) refuse("source-unverified"); return result;
  }
  const source = fileURLToPath(new URL("./index.mjs", import.meta.url));
  if (!canonical(source).startsWith(ctx.root + path.sep)) refuse("control-source-mismatch");
  const files = (await gitText(ctx, ["ls-files", "-z", "--", "scripts/pr"])).split("\0").filter(Boolean);
  if (!files.includes("scripts/pr/index.mjs")) refuse("source-unverified");
  if (mutation && await gitText(ctx, ["status", "--porcelain=v1", "-z", "--untracked-files=all", "--", "scripts/pr"])) refuse("control-source-dirty");
  for (const file of files) noLinks(path.join(ctx.root, file));
  return gitText(ctx, ["rev-parse", "HEAD^{commit}"]);
}
function requireDeviceIdentity(ctx) { for (const directory of [ctx.root, ctx.common]) directoryIdentity(directory); }
async function create(ctx, options, active, revision) {
  let stored;
  if (!options.task) {
    const record = newTask(ctx, active.installationId, { owner: options.owner, branch: options.branch, path: options.path, baseSha: "0".repeat(40), toolRevision: revision });
    return withGuard(ctx, "task", record.taskId, async () => {
      const remote = await remoteSnapshot(ctx, options.branch); if (remote.branch) refuse("remote-branch-exists");
      return withGuard(ctx, "common", undefined, async () => {
      await checkNewPath(ctx, options.path, options.branch, (await listTasks(ctx)).map(t => t.record));
      record.baseSha = remote.dev; stored = await createTaskRecord(ctx, record);
      await git(ctx, ["worktree", "add", "-b", record.branch, "--", record.path, remote.dev], { diagnostics: true });
      const identity = await worktreeState(ctx, record, { marker: false });
      if (!identity.present || identity.head !== remote.dev) refuse("creation-incomplete");
      publishJson(path.join(identity.admin, MARKER), markerFor(record));
      await saveTask(ctx, stored, { phase: "working", admin: identity.admin, directory: identity.directory,
        creation: { ...record.creation, state: "ready" }, worktree: { state: "present", requestId: null } });
      return stored;
      });
    });
  }
  return withGuard(ctx, "task", options.task, async () => {
    stored = await loadTask(ctx, options.task); authorize(stored, options); await installationTask(ctx, stored, active);
    if (stored.record.phase !== "creating") refuse("not-creating");
    return withGuard(ctx, "common", undefined, async () => {
      const r = stored.record;
      const exists = lstat(r.path), head = await branchHead(ctx, r.branch);
      if (!exists && !head) {
        const remote = await remoteSnapshot(ctx, r.branch);
        if (remote.dev !== r.baseSha || remote.branch) refuse("creation-base-changed");
        await checkNewPath(ctx, r.path, r.branch, (await listTasks(ctx)).filter(t => t.record.taskId !== r.taskId).map(t => t.record));
        await git(ctx, ["worktree", "add", "-b", r.branch, "--", r.path, r.baseSha], { diagnostics: true });
      }
      const identity = await worktreeState(ctx, r, { marker: false });
      if (!identity.present || identity.head !== r.baseSha || await branchHead(ctx, r.branch) !== r.baseSha) refuse("creation-incomplete");
      const marker = path.join(identity.admin, MARKER);
      if (!lstat(marker) && !options.confirmCreatedByTask) refuse("creation-confirmation-required");
      publishJson(marker, markerFor(r));
      await saveTask(ctx, stored, { phase: "working", admin: identity.admin, directory: identity.directory,
        creation: { ...r.creation, state: "ready" }, worktree: { state: "present", requestId: null } });
      return stored;
    });
  });
}
async function complete(ctx, stored, options) {
  if (stored.record.pr && stored.record.pr.number !== options.pr) refuse("pr-binding-mismatch");
  if (stored.record.purpose === "retire") refuse("purpose-conflict");
  if (stored.record.purpose === "merged") { await cleanup(ctx, stored, options); return; }
  const view = await pull(ctx, { ...stored.record, expectedHead: options.expectedHead }, options.pr);
  if (view.state === "CLOSED") refuse("closed-unmerged");
  let checked = null;
  if (view.state === "OPEN" && !["merge-requested"].includes(stored.record.phase)) checked = await preflight(ctx, { ...stored.record, expectedHead: options.expectedHead }, options.pr);
  await seal(ctx, stored, options, view.binding);
  if (!stored.record.pr) await change(ctx, stored, { pr: view.binding });
  if (view.state === "MERGED") {
    const proof = await mergeProof(ctx, stored.record);
    if (!proof) refuse("merge-observation-unavailable");
    await recordMerged(ctx, stored, options, proof, view.binding);
    await cleanup(ctx, stored, options); return;
  }
  if (stored.record.phase === "merge-requested") {
    const prior = Object.values(stored.record.requests).filter(r => r.operation === "complete");
    if (!prior.length || prior.some(r => r.outcome !== "rejected") || stored.record.requests[options.requestId]) refuse("merge-outcome-unknown");
  } else if (stored.record.phase !== "sealed") refuse("invalid-phase");
  await currentHead(ctx, stored.record, options.expectedHead);
  if ((await inspectFiles(ctx, stored.record, handoff)).fingerprint !== stored.record.release.fingerprint) refuse("files-changed");
  checked = await preflight(ctx, stored.record, options.pr);
  await withGuard(ctx, "common", undefined, async () => {
    await currentHead(ctx, stored.record, options.expectedHead);
    if ((await inspectFiles(ctx, stored.record, handoff)).fingerprint !== stored.record.release.fingerprint) refuse("files-changed");
    await saveTask(ctx, stored, { phase: "merge-requested", pr: checked.pr.binding, requests: requestChange(stored, options, "intent"), reasons: [] });
  });
  assertGuard(ctx, "task", stored.record.taskId);
  if (await refOid(ctx, taskRef(stored.record.taskId)) !== stored.oid) refuse("state-changed");
  const outcome = await requestMerge(ctx, stored.record);
  if (outcome === "rejected") {
    await change(ctx, stored, { requests: requestChange(stored, options, "rejected"), reasons: ["merge-rejected"] }); return;
  }
  const proof = await observeMerge(ctx, stored.record);
  if (!proof) {
    await change(ctx, stored, { requests: requestChange(stored, options, "pending"), reasons: ["merge-outcome-unknown"] }); return;
  }
  proof.check = checked.check;
  await change(ctx, stored, { phase: "merged", purpose: "merged", merge: proof, reasons: [] });
  await cleanup(ctx, stored, options);
}
async function recover(ctx, stored) {
  const r = stored.record;
  if (["complete", "retired"].includes(r.phase)) { await terminal(ctx, stored); return; }
  if (r.release && r.pr && !r.merge) {
    const proof = await mergeProof(ctx, r);
    if (proof) await change(ctx, stored, { phase: "merged", purpose: "merged", merge: proof, reasons: [] });
  }
  if (stored.record.worktree.state === "intent" && !(await worktreeState(ctx, stored.record)).present) {
    await change(ctx, stored, { phase: "cleanup-pending", worktree: { ...stored.record.worktree, state: "removed" } });
  }
}
async function taskCommand(ctx, stored, options) {
  if (["complete", "retired"].includes(stored.record.phase)) {
    if (options.pr && options.pr !== stored.record.pr?.number) refuse("pr-binding-mismatch");
    if (options.operation === "resume" || options.operation === "retire" && stored.record.phase === "complete"
      || options.operation === "complete" && stored.record.phase === "retired") refuse("purpose-conflict");
    await terminal(ctx, stored); return;
  }
  if (options.operation === "complete") return complete(ctx, stored, options);
  if (options.operation === "cleanup") return cleanup(ctx, stored, options);
  if (options.operation === "recover") return recover(ctx, stored);
  if (options.operation === "resume") {
    if (stored.record.phase !== "sealed" || Object.values(stored.record.requests).some(r => r.operation === "complete")) refuse("resume-not-authorized");
    await currentHead(ctx, stored.record, stored.record.release.head);
    if ((await inspectFiles(ctx, stored.record, handoff)).fingerprint !== stored.record.release.fingerprint) refuse("files-changed");
    await attachResumedLink(ctx, stored);
    return change(ctx, stored, { phase: "working", release: null, pr: null, observation: null, reasons: [] });
  }
  if (options.operation === "retire") {
    if (stored.record.purpose === "merged") refuse("purpose-conflict");
    if (!stored.record.purpose) {
      let binding = stored.record.pr;
      if (options.pr || binding) {
        const view = await pull(ctx, { ...stored.record, expectedHead: options.expectedHead }, options.pr ?? binding.number);
        if (view.state !== "CLOSED") refuse("retire-pr-not-closed"); binding = view.binding;
      }
      await noOpenDependencies(ctx, stored.record);
      const remote = await remoteSnapshot(ctx, stored.record.branch);
      if (!await ancestor(ctx, options.expectedHead, remote.dev)) refuse("head-not-in-dev");
      await seal(ctx, stored, options, binding);
      await change(ctx, stored, { phase: "cleanup-pending", purpose: "retire", requests: requestChange(stored, options, "pending"), reasons: [] });
    }
    return cleanup(ctx, stored, options);
  }
  if (options.operation === "acknowledge-removal") {
    if (stored.record.phase !== "cleanup-pending" || !stored.record.release || !stored.record.purpose) refuse("external-removal-not-authorized");
    await preservation(ctx, stored.record);
    if ((await worktreeState(ctx, stored.record)).present) refuse("external-removal-unconfirmed");
    if (await branchHead(ctx, stored.record.branch) !== options.expectedHead) refuse("head-changed");
    if (stored.record.requests[options.requestId]?.outcome === "complete") return;
    return change(ctx, stored, { externalRemoval: { requestId: options.requestId, head: options.expectedHead, instance: options.expectedInstance, at: new Date().toISOString() },
      worktree: { state: "external", requestId: options.requestId }, requests: requestChange(stored, options, "complete"), reasons: ["external-removal-acknowledged"] });
  }
  refuse("invalid-input");
}
function report(operation, stored, extra = {}) {
  const r = stored?.record;
  return { schemaVersion: 1, operation, task: r?.taskId ?? null, state: stored?.oid ?? null, phase: r?.phase ?? null,
    pr: r?.pr ?? null, purpose: r?.purpose ?? null, merge: r?.merge ?? null, worktree: r?.worktree ?? null, branch: r?.branchEffect ?? null,
    capability: r?.observation?.capability ?? null, lastObservation: r?.observation ?? null, externalRemoval: r?.externalRemoval ?? null,
    observationPerformed: false, reasons: r?.reasons ?? [], nextActions: r?.phase === "cleanup-pending" ? ["inspect", "cleanup"] : [],
    ...(r ? { owner: r.owner, path: r.path, branchName: r.branch, instance: r.instanceId, head: r.release?.head ?? (["start", "create"].includes(operation) ? r.baseSha : null), sequence: r.sequence } : {}), ...extra };
}
async function migrationStatus(ctx) {
  const oid = await refOid(ctx, MIGRATION_REF);
  if (!oid) return null;
  const { record } = await readStateObject(ctx, oid);
  if (!validJournal(record, ctx)) refuse("migration-journal-invalid");
  return { state: oid, phase: record.phase, installationId: record.installationId, planDigest: record.planDigest,
    fence: path.join(ctx.common, "stagekeeper-task-worktrees", "command.guard") };
}
export async function runPrCommand(input, ports = {}) {
  let options, ctx, stored, handoffState;
  const candidates = [];
  try {
    options = validateOptions({ ...input }); ctx = await context(options.root, options.signal, ports);
    const readonly = ["status", "inspect"].includes(options.operation) || options.operation === "migrate" && options.action === "preview"
      || options.operation === "recover-guard" && !options.expectedNonce;
    if (options.operation === "status" || options.operation === "inspect") {
      const guardBefore = guardStatus(ctx, "common");
      const before = await activation(ctx);
      const migration = await migrationStatus(ctx);
      if (options.task) stored = await loadTask(ctx, options.task);
      const tasks = stored ? [stored] : await listTasks(ctx);
      const views = [];
      for (const task of tasks) {
        let liveHead = null, localReasons = [];
        try { liveHead = await branchHead(ctx, task.record.branch); }
        catch (error) { localReasons = [error instanceof PrFailure ? error.code : "head-unverified"]; }
        views.push(report("status", task, { head: task.record.release?.head ?? liveHead, liveHead, localReasons }));
      }
      let remote = null, local = null;
      if (options.operation === "inspect") handoffState = await inspectHandoff(ctx, stored);
      if (options.operation === "inspect") {
        try {
          const identity = await worktreeState(ctx, stored.record);
          local = { ...identity, branchHead: await branchHead(ctx, stored.record.branch), files: null, reasons: [] };
          if (identity.present) {
            try { local.files = await inspectFiles(ctx, stored.record, handoff); }
            catch (error) { local.reasons = [error instanceof PrFailure ? error.code : "inspection-unavailable"]; }
          }
        } catch (error) { local = { present: null, reasons: [error instanceof PrFailure ? error.code : "inspection-unavailable"] }; }
      }
      if (options.operation === "inspect" && options.remote) {
        remote = await remoteSnapshot(ctx, stored.record.branch, { fetch: false });
        if (options.pr || stored.record.pr) {
          const head = stored.record.release?.head ?? await branchHead(ctx, stored.record.branch);
          remote.pr = await pull(ctx, { ...stored.record, expectedHead: head }, options.pr ?? stored.record.pr.number);
        }
      }
      const changed = guardBefore.state !== "absent" || guardStatus(ctx, "common").state !== "absent"
        || await refOid(ctx, MIGRATION_REF) !== (migration?.state ?? null)
        || (await activation(ctx)).appliedOid !== before.appliedOid
        || (await Promise.all(tasks.map(async t => await refOid(ctx, taskRef(t.record.taskId)) !== t.oid))).some(Boolean);
      return report(options.operation, stored, { exitCode: 0, active: before.active, legacyPresent: Boolean(lstat(path.join(ctx.common, "stagekeeper-task-worktrees"))),
        tasks: views, ...(stored ? { head: views[0].head, liveHead: views[0].liveHead, localReasons: views[0].localReasons } : {}), local, remote, migration,
        ...(handoffState ? { handoff: handoffState, handoffReasons: handoffState === "held" ? stored.record.reasons : [] } : {}), reasons: changed ? ["transition-in-progress"] : before.active ? [] : [before.reason] });
    }
    requireDeviceIdentity(ctx);
    const revision = await sourceRevision(ctx, !readonly);
    if (options.operation === "migrate") {
      const result = await migrate(ctx, options, revision);
      if (options.action === "preview") return { ...report("migrate", null), plan: result, planDigest: digest(json(result)), reasons: result.reasons, exitCode: 0 };
      return { ...report("migrate", null), ...result, exitCode: 0 };
    }
    if (options.operation === "recover-guard") return report(options.operation, null, { guard: await recoverGuard(ctx, options.guard, options.task, options.expectedNonce, options.confirmedQuiescent), exitCode: 0 });
    const active = await requireActivation(ctx);
    if (options.operation === "start") await cleanupBeforeStart(ctx, active, options, candidates);
    if (["start", "create"].includes(options.operation)) stored = await create(ctx, options, active, revision);
    else await withGuard(ctx, "task", options.task, async () => {
      stored = await loadTask(ctx, options.task);
      if (options.operation === "release") {
        handoffState = await releaseTask(ctx, stored, active, options);
        return;
      }
      authorize(stored, options); await installationTask(ctx, stored, active);
      try { await taskCommand(ctx, stored, options); }
      catch (error) {
        if (stored.record.purpose && !["complete", "retired"].includes(stored.record.phase) && !ctx.unsettled && !ctx.signal?.aborted) {
          try { await change(ctx, stored, { phase: "cleanup-pending", reasons: [error instanceof PrFailure ? error.code : "execution-failed"] }); } catch {}
        }
        throw error;
      }
    });
    const needsTerminal = ["complete", "cleanup", "retire"].includes(options.operation);
    return report(options.operation, stored, { ...(options.operation === "start" ? { candidates } : {}), ...(handoffState ? { handoff: handoffState } : {}), exitCode: needsTerminal && !["complete", "retired"].includes(stored.record.phase) ? 2 : 0,
      observationPerformed: ctx.usageObservation?.performed ?? false });
  } catch (error) {
    const code = error instanceof PrFailure ? error.code : "execution-failed";
    if (ctx && !ctx.unsettled && !ctx.signal?.aborted && options?.task) { try { stored = await loadTask(ctx, options.task); } catch {} }
    let migration = null;
    if (ctx && !ctx.unsettled && !ctx.signal?.aborted && options?.operation === "migrate") { try { migration = await migrationStatus(ctx); } catch {} }
    return report(options?.operation ?? input?.operation ?? null, stored, { exitCode: error instanceof PrFailure ? error.exitCode : 1, reasons: [code],
      ...(options?.operation === "start" ? { candidates } : {}), observationPerformed: ctx?.usageObservation?.performed ?? false,
      ...(migration ? { migration, state: migration.state, phase: migration.phase } : {}) });
  }
}
export async function runCli(namespace) {
  const controller = new AbortController();
  const cancel = () => controller.abort();
  process.once("SIGINT", cancel); process.once("SIGTERM", cancel);
  let result;
  try { result = await runPrCommand({ ...parseArgs(process.argv.slice(2), namespace), signal: controller.signal }); }
  catch (error) { result = report(null, null, { exitCode: error instanceof PrFailure ? error.exitCode : 1, reasons: [error instanceof PrFailure ? error.code : "execution-failed"] }); }
  process.removeListener("SIGINT", cancel); process.removeListener("SIGTERM", cancel);
  process.stdout.write(JSON.stringify(result) + "\n"); process.exitCode = result.exitCode;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await runCli("pr");

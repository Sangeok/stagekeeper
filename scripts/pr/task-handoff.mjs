import { randomUUID } from "node:crypto";
import { PrFailure, ancestor, checkNewPath, refuse, remoteSnapshot } from "./git-workspace.mjs";
import { authorize, listTasks, loadTask, withGuard } from "./task-state.mjs";
import { installationTask } from "./legacy-migration.mjs";
import { discoverPull, mergeProof, pull } from "./github-merge.mjs";
import { handoffStatus, orderedCandidates, recordCandidate, releaseRef, releaseRefs } from "./release-refs.mjs";
import { releaseScope } from "./release-scope.mjs";
import { change, cleanup, recordMerged, seal } from "./task-closeout.mjs";
import { admissionDeadline, checkAdmission, readBeforeAdmission } from "./task-admission.mjs";

export async function inspectHandoff(ctx, stored) {
  const refs = await releaseRefs(ctx, { task: stored.record.taskId });
  if (!refs.length) return "absent";
  return handoffStatus(stored, refs, await releaseScope(ctx, stored.record.installationId));
}

export async function attachResumedLink(ctx, stored) {
  const refs = await releaseRefs(ctx, { task: stored.record.taskId });
  const matching = refs.filter(ref => ref.oid === stored.oid);
  if (matching.length > 1 || matching.some(ref => ref.symbolic)) refuse("release-ref-ambiguous");
  stored.releaseLink = matching[0];
}

export async function releaseTask(ctx, stored, active, options) {
  const r = stored.record;
  if (r.owner !== options.owner) refuse("owner-mismatch");
  if (r.instanceId !== options.expectedInstance) refuse("identity-changed");
  const refs = await releaseRefs(ctx, { task: r.taskId });
  const unverified = new Set(refs.map(ref => ref.oid));
  let issued;
  await installationTask(ctx, stored, active, state => {
    unverified.delete(state.oid);
    const release = state.record.release;
    if (release?.requestId === options.requestId && release.sourceState === state.record.previousStateOid) issued = state;
  });
  if (unverified.size || refs.some(ref => ref.symbolic)) refuse("release-ref-unverified");
  const scope = await releaseScope(ctx, active.installationId);
  if (issued) {
    const release = issued.record.release;
    if (release.sourceState !== options.expectedState || release.head !== options.expectedHead
      || (issued.record.pr?.number ?? null) !== (options.pr ?? null)) refuse("request-conflict");
    const status = handoffStatus(stored, refs, scope);
    if (stored.oid !== issued.oid || !["active", "held"].includes(status)) refuse("release-superseded");
    return status;
  }
  if (r.requests[options.requestId]) refuse("request-conflict");
  authorize(stored, options);
  if (r.phase !== "working" || refs.some(ref => ref.oid === stored.oid)) refuse("release-not-authorized");
  const pr = options.pr ? await pull(ctx, { ...r, expectedHead: options.expectedHead }, options.pr) : null;
  await seal(ctx, stored, options, pr?.binding ?? null, observation => {
    const issuedScope = observation.capability === "qualified" ? scope : "held";
    const name = releaseRef(issuedScope, r.taskId);
    stored.releaseLink = { name, oid: refs.find(ref => ref.name === name)?.oid ?? null };
    if (issuedScope !== "held") return [];
    return [observation.capability === "qualified" ? "release-scope-unavailable" : "unqualified-profile"];
  });
  return stored.record.reasons.length ? "held" : "active";
}

function cleanupOptions(r, expectedState, requestId) {
  return { operation: "cleanup", task: r.taskId, owner: r.owner, expectedState,
    expectedInstance: r.instanceId, expectedHead: r.release.head, requestId };
}

function candidateResult(ref, stored, reasons, observedPr) {
  const r = stored?.record;
  return { task: ref.task ?? null, state: stored?.oid ?? null, phase: r?.phase ?? null,
    pr: r?.pr?.number ?? observedPr ?? null, path: r?.path ?? null, branchName: r?.branch ?? null,
    worktree: r?.worktree.state ?? null, branch: r?.branchEffect.state ?? null, reasons: reasons ?? r?.reasons ?? [] };
}

function candidateFailure(error) {
  if (error instanceof PrFailure) return error;
  if (["EACCES", "EPERM", "EIO", "ESTALE", "ELOOP", "ENOENT", "ENOTDIR", "EROFS"].includes(error.code)) {
    return new PrFailure("candidate-filesystem-unavailable", 2);
  }
  return null;
}

function mustStop(ctx, error) {
  return ctx.signal?.aborted || ctx.unsettled || ctx.children.size > 0 || ctx.guards.size > 1
    || error.guardKind === "common" || ["guard-changed", "guard-unverified", "guard-write-failed", "cancelled"].includes(error.code);
}

async function previousCleanup(ctx, active, stored) {
  const r = stored.record;
  let effect;
  await installationTask(ctx, stored, active, state => {
    if (state.record.phase !== "merged" || state.record.release?.requestId !== r.release.requestId) return;
    for (const [id, request] of Object.entries(state.record.requests)) {
      if (request.operation !== "cleanup" || request.expectedState !== state.record.previousStateOid) continue;
      if (effect) refuse("cleanup-request-ambiguous");
      effect = cleanupOptions(r, request.expectedState, id);
    }
  });
  return effect;
}

async function processCandidate(ctx, active, scope, ref, deadline, results) {
  let stored, observedPr;
  try {
    const result = await withGuard(ctx, "task", ref.task, async () => {
      stored = await loadTask(ctx, ref.task);
      const refs = await releaseRefs(ctx, { task: ref.task });
      const r = stored.record;
      if (stored.oid !== ref.oid || handoffStatus(stored, refs, scope) !== "active") refuse("release-state-changed");
      if (!["sealed", "merged", "cleanup-pending"].includes(r.phase) || r.purpose === "retire") refuse("release-not-authorized");
      let effect = await previousCleanup(ctx, active, stored);
      stored.releaseLink = { name: ref.name, oid: stored.oid };
      try {
        if (r.phase === "sealed") {
          const { binding, proof } = await readBeforeAdmission(ctx, deadline, async () => {
            const number = r.pr?.number ?? await discoverPull(ctx, r);
            const view = await pull(ctx, r, number);
            observedPr = number;
            if (view.state !== "MERGED") refuse(view.state === "OPEN" ? "pr-open" : "closed-unmerged");
            const proof = await mergeProof(ctx, { ...r, pr: view.binding });
            if (!proof || proof.merge !== view.merge || proof.merge === r.baseSha || !await ancestor(ctx, r.baseSha, proof.merge)) refuse("task-merge-unverified");
            return { binding: view.binding, proof };
          });
          checkAdmission(deadline);
          effect = cleanupOptions(r, stored.oid, randomUUID());
          await recordMerged(ctx, stored, effect, proof, binding);
        }
        if (!effect || stored.record.purpose !== "merged") refuse("cleanup-request-unverified");
        authorize(stored, effect);
        await cleanup(ctx, stored, effect, deadline);
        return candidateResult(ref, stored);
      } catch (error) {
        const failure = candidateFailure(error);
        if (mustStop(ctx, error) || !failure) throw error;
        if (stored.record.purpose === "merged" && stored.record.phase !== "complete" && !stored.record.reasons.includes(failure.code)) {
          await change(ctx, stored, { phase: "cleanup-pending", reasons: [failure.code] });
        }
        return candidateResult(ref, stored, [failure.code], observedPr);
      }
    });
    results.push(result);
  } catch (error) {
    if (!stored && error.guardKind === "task" && !ctx.unsettled && !ctx.signal?.aborted) {
      try { stored = await loadTask(ctx, ref.task); } catch { stored = null; }
    }
    const failure = candidateFailure(error);
    results.push(candidateResult(ref, stored, [failure?.code ?? "execution-failed"], observedPr));
    if (mustStop(ctx, error) || ctx.guards.size || !failure) throw error;
  }
}

export async function cleanupBeforeStart(ctx, active, options, results) {
  const scope = await releaseScope(ctx, active.installationId);
  if (scope === "held") return;
  const deadline = admissionDeadline(ctx);
  let candidates;
  try {
    candidates = await releaseRefs(ctx, { scope });
    if (!candidates.length) return;
  } catch (error) {
    if (mustStop(ctx, error) || !(error instanceof PrFailure)) throw error;
    results.push(candidateResult({}, null, [error.code]));
    return;
  }
  const remote = await remoteSnapshot(ctx, options.branch);
  if (remote.branch) refuse("remote-branch-exists");
  await checkNewPath(ctx, options.path, options.branch, (await listTasks(ctx)).map(task => task.record));
  let ordered;
  try { ordered = orderedCandidates(ctx, scope, candidates); }
  catch {
    results.push(candidateResult({}, null, ["release-cursor-unavailable"]));
    return;
  }
  for (const ref of ordered.slice(0, 4)) {
    if (deadline.clock() >= deadline.end) break;
    const cursorSaved = await withGuard(ctx, "common", undefined, () => {
      try { recordCandidate(ctx, scope, ref.task); return true; }
      catch { return false; }
    });
    if (!cursorSaved) {
      results.push(candidateResult(ref, null, ["release-cursor-unavailable"]));
      return;
    }
    await processCandidate(ctx, active, scope, ref, deadline, results);
  }
}

import { branchHead, git, inspectFiles, outsideTarget, refuse, registry, worktreeState } from "./git-workspace.mjs";
import { assertGuard, requestChange, saveTask, withGuard } from "./task-state.mjs";
import { preservation } from "./github-merge.mjs";
import { inspectWorktreeUsage } from "./process-usage/process-usage.mjs";
import { checkAdmission, readBeforeAdmission } from "./task-admission.mjs";

export async function change(ctx, stored, value, options) {
  return withGuard(ctx, "common", undefined, async () => saveTask(ctx, stored, value, options));
}
export async function recordMerged(ctx, stored, options, proof, binding) {
  await change(ctx, stored, { phase: "merged", purpose: "merged", pr: binding, merge: proof, reasons: [],
    requests: requestChange(stored, options, "pending") });
}

export async function currentHead(ctx, record, expected) {
  const state = await worktreeState(ctx, record);
  if (!state.present || state.head !== expected || await branchHead(ctx, record.branch) !== expected) refuse("head-changed");
  return state;
}
async function observeUsage(ctx, record) {
  const value = await (ctx.ports.inspectUsage ?? inspectWorktreeUsage)({ worktreePath: record.path, signal: ctx.signal });
  if (value.observer?.state === "unsettled") ctx.unsettled = true;
  const observation = { at: new Date().toISOString(), status: ["clear", "busy", "unknown"].includes(value.status) ? value.status : "unknown",
    capability: value.capability?.status === "qualified" ? "qualified" : "unqualified", profile: value.capability?.profile ?? null,
    revision: value.capability?.revision ?? null, performed: value.observationPerformed === true, coverageComplete: value.observation?.coverageComplete === true,
    settled: value.observer?.state === "settled" };
  ctx.usageObservation = observation;
  return observation;
}
export const handoff = { purpose: "handoff" };
const removal = { purpose: "removal" };
const clearUsage = o => o.status === "clear" && o.capability === "qualified" && o.performed && o.coverageComplete && o.settled;
export async function seal(ctx, stored, options, pr = null, registerRelease) {
  if (stored.record.phase !== "working") return;
  outsideTarget(ctx, stored.record);
  await currentHead(ctx, stored.record, options.expectedHead);
  const files = await inspectFiles(ctx, stored.record, handoff), observation = await observeUsage(ctx, stored.record);
  if (observation.status === "busy" || ctx.unsettled) refuse("worktree-in-use");
  const reasons = registerRelease ? registerRelease(observation) : [];
  await withGuard(ctx, "common", undefined, async () => {
    await currentHead(ctx, stored.record, options.expectedHead);
    if ((await inspectFiles(ctx, stored.record, handoff)).fingerprint !== files.fingerprint) refuse("files-changed");
    await saveTask(ctx, stored, { phase: "sealed", pr, observation, reasons, release: { head: options.expectedHead, instance: options.expectedInstance,
      at: new Date().toISOString(), fingerprint: files.fingerprint, sourceState: stored.oid, requestId: options.requestId } });
  });
}
export async function terminal(ctx, stored) {
  if ((await worktreeState(ctx, stored.record)).present || await branchHead(ctx, stored.record.branch) !== null) refuse("completed-target-reappeared");
  if (!["complete", "retired"].includes(stored.record.phase)) refuse("not-terminal");
}

export async function cleanup(ctx, stored, options, admission) {
  let r = stored.record;
  if (!r.release || !r.purpose || !["merged", "cleanup-pending"].includes(r.phase)) refuse("cleanup-not-authorized");
  outsideTarget(ctx, r);
  await readBeforeAdmission(ctx, admission, () => preservation(ctx, r));
  let removedHere = false;
  const state = await worktreeState(ctx, r);
  if (state.present) {
    if (["removed", "external"].includes(r.worktree.state)) refuse("removed-target-reappeared");
    await currentHead(ctx, r, r.release.head);
    const files = await inspectFiles(ctx, r, removal);
    if (files.fingerprint !== r.release.fingerprint) refuse("files-changed");
    const observation = await observeUsage(ctx, r);
    if (admission && ctx.unsettled) refuse("usage-observer-unsettled");
    if (!clearUsage(observation)) {
      const reason = observation.status === "busy" ? "worktree-in-use" : observation.capability === "unqualified" ? "unqualified-profile" : "usage-unverified";
      if (admission && r.phase === "cleanup-pending" && r.reasons.length === 1 && r.reasons[0] === reason) return;
      await change(ctx, stored, { phase: "cleanup-pending", observation, reasons: [reason],
        requests: requestChange(stored, options, "pending") }); return;
    }
    await withGuard(ctx, "common", undefined, async () => {
      assertGuard(ctx, "task", r.taskId);
      await currentHead(ctx, r, r.release.head);
      if ((await inspectFiles(ctx, r, removal)).fingerprint !== files.fingerprint) refuse("files-changed");
      await saveTask(ctx, stored, { phase: "cleanup-pending", observation, worktree: { state: "intent", requestId: options.requestId },
        requests: requestChange(stored, options, "intent"), reasons: [] }, { beforeCommit: () => checkAdmission(admission) });
      await git(ctx, ["worktree", "remove", "--", r.path], { diagnostics: true });
      if ((await worktreeState(ctx, stored.record)).present) refuse("removal-unconfirmed");
      await saveTask(ctx, stored, { worktree: { state: "removed", requestId: options.requestId } });
      removedHere = true;
    });
  } else if (!["intent", "removed", "external"].includes(r.worktree.state)) refuse("external-removal-unconfirmed");
  else if (r.worktree.state === "intent") await change(ctx, stored, { worktree: { ...r.worktree, state: "removed" } });
  if (admission && !removedHere) refuse("branch-ownership-unconfirmed");
  r = stored.record;
  await preservation(ctx, r);
  if ((await registry(ctx)).some(w => w.branch === "refs/heads/" + r.branch)) refuse("branch-in-use");
  await withGuard(ctx, "common", undefined, async () => {
    if ((await worktreeState(ctx, r)).present) refuse("removed-target-reappeared");
    const head = await branchHead(ctx, r.branch);
    if (head === null) {
      if (r.branchEffect.state !== "intent") refuse("branch-removal-unconfirmed");
      await saveTask(ctx, stored, { phase: r.purpose === "merged" ? "complete" : "retired", branchEffect: { ...r.branchEffect, state: "removed" },
        reasons: [], requests: requestChange(stored, options, "complete") }); return;
    }
    if (head !== r.release.head) refuse("head-changed");
    await saveTask(ctx, stored, { branchEffect: { state: "intent", requestId: options.requestId } });
    if ((await registry(ctx)).some(w => w.branch === "refs/heads/" + r.branch) || (await worktreeState(ctx, r)).present) refuse("branch-in-use");
    if (await branchHead(ctx, r.branch) !== r.release.head) refuse("head-changed");
    await saveTask(ctx, stored, { phase: r.purpose === "merged" ? "complete" : "retired", branchEffect: { state: "removed", requestId: options.requestId },
      reasons: [], requests: requestChange(stored, options, "complete") }, { deleteBranch: true });
  });
  await terminal(ctx, stored);
}

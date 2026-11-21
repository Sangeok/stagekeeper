import { PrFailure, refuse, branchHead, worktreeState, inspectFiles, outsideTarget, ancestor, monotonic } from "./git-workspace.mjs";
import { listTasks, loadTask } from "./task-state.mjs";
import { pull, mergeProof, preservation, findMergedPull } from "./github-merge.mjs";

const START_BUDGET_MS = 20000;
const removal = { purpose: "removal" };
const excluded = record => ["creating", "complete", "retired"].includes(record.phase) || record.purpose === "retire";
const provenFirst = (a, b) => Number(b.record.purpose === "merged") - Number(a.record.purpose === "merged")
  || (a.record.taskId < b.record.taskId ? -1 : 1);

async function qualify(ctx, record, requireClearUsage) {
  if (record.worktree.state !== "present") refuse("worktree-effect-recorded");
  outsideTarget(ctx, record);
  const state = await worktreeState(ctx, record);
  if (!state.present) refuse("worktree-absent");
  const head = await branchHead(ctx, record.branch);
  if (head !== state.head || record.release && record.release.head !== head) refuse("head-changed");
  if (head === record.baseSha) refuse("no-task-commits");
  const files = await inspectFiles(ctx, record, removal);
  if (record.release && files.fingerprint !== record.release.fingerprint) refuse("files-changed");
  const number = record.pr?.number ?? await findMergedPull(ctx, record, head);
  if (!number) refuse("no-merged-pr");
  const view = await pull(ctx, { ...record, expectedHead: head }, number);
  if (view.state !== "MERGED") refuse(view.state === "OPEN" ? "pr-open" : "closed-unmerged");
  await requireClearUsage(record);
  const bound = { ...record, pr: view.binding, release: record.release ?? { head }, purpose: "merged" };
  const proof = await mergeProof(ctx, bound);
  if (!proof) refuse("merge-observation-unavailable");
  if (record.merge && record.merge.merge !== proof.merge) refuse("merge-not-preserved");
  if (proof.merge === record.baseSha || !await ancestor(ctx, record.baseSha, proof.merge)) refuse("merge-predates-task");
  await preservation(ctx, { ...bound, merge: proof });
  return { pr: number, head };
}

export async function sweepMergedTasks(ctx, active, { requireClearUsage, settle }) {
  const clock = ctx.ports.clock ?? monotonic, end = clock() + START_BUDGET_MS;
  const tasks = (await listTasks(ctx)).filter(t => t.record.installationId === active.installationId && !excluded(t.record)).sort(provenFirst);
  const results = [];
  let notExamined = 0;
  for (const observed of tasks) {
    if (ctx.signal?.aborted) refuse("cancelled");
    if (ctx.unsettled) refuse("process-unsettled", 1);
    if (clock() >= end) { notExamined++; continue; }
    const { taskId, branch, path } = observed.record;
    let final = observed, pr = observed.record.pr?.number ?? null, reasons;
    try {
      const checked = await qualify(ctx, observed.record, requireClearUsage);
      pr = checked.pr;
      final = await settle(observed, checked);
      reasons = final.record.reasons;
    } catch (error) {
      if (ctx.signal?.aborted || ctx.unsettled) throw error;
      reasons = [error instanceof PrFailure ? error.code : "execution-failed"];
      try { final = await loadTask(ctx, taskId); } catch {}
    }
    results.push({ task: taskId, branchName: branch, path, pr, phase: final.record.phase, worktree: final.record.worktree.state,
      branch: final.record.branchEffect.state, reasons });
  }
  const removed = results.filter(row => row.phase === "complete").length;
  return { examined: results.length, removed, held: results.length - removed, notExamined, results };
}

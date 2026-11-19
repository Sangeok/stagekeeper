import { monotonic, refuse } from "./git-workspace.mjs";

export function admissionDeadline(ctx) {
  const clock = ctx.ports.clock ?? monotonic;
  return { clock, end: clock() + 20000 };
}

export function checkAdmission(deadline) {
  if (deadline && deadline.clock() >= deadline.end) refuse("task-admission-expired");
}

export async function readBeforeAdmission(ctx, deadline, read) {
  if (!deadline) return read();
  checkAdmission(deadline);
  const previous = ctx.deadline;
  ctx.deadline = deadline;
  try {
    return await read();
  } catch (error) {
    if (!ctx.signal?.aborted && !ctx.unsettled) checkAdmission(deadline);
    throw error;
  } finally {
    ctx.deadline = previous;
  }
}

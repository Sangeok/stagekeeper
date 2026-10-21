export const STATUS_LABEL: Record<string, string> = {
  proposed: "Proposed",
  planning: "Planning",
  in_review: "In review",
  implementing: "Implementing",
  done: "Done",
  on_hold: "On hold",
};

export function statusLabel(status: string | null): string {
  if (status === null) return "Not on board";
  return Object.prototype.hasOwnProperty.call(STATUS_LABEL, status) ? STATUS_LABEL[status] : status;
}

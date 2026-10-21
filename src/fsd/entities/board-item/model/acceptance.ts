export function isAwaitingAcceptance(status: string | null, accepted: boolean): boolean {
  return status === "done" && !accepted;
}

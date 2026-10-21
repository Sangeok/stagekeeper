export function isPlanVerified(status: string | null, validation: string | null): boolean {
  return status === "in_review" && validation !== null;
}

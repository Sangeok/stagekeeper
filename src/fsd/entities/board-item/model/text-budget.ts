import { TEXT_LIMIT } from "@harness/core/transitions.mjs";

export const FIELD_BUDGET: number = TEXT_LIMIT;

export function isOverBudget(fields: readonly (string | null)[]): boolean {
  return fields.some((f) => f !== null && f.length > FIELD_BUDGET);
}

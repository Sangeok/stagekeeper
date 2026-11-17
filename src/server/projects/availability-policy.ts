import { limitsFor } from "@harness/shared/plans/limits.mjs";

type AvailabilityCandidate = { id: string; lastSelectedAt: Date | null; lastAgentActivityAt: Date | null; lastSyncedAt: Date | null; createdAt: Date };

const timestamp = (value: unknown, field: string): number => {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) throw new Error(`${field} must be a valid Date`);
  return value.getTime();
};

const nullableTimestamp = (value: unknown, field: string): number | null => value === null ? null : timestamp(value, field);

const compareNullableDesc = (left: number | null, right: number | null): number => {
  if (left === null) return right === null ? 0 : 1;
  if (right === null) return -1;
  return right - left;
};

const compareId = (left: string, right: string): number => left < right ? -1 : left > right ? 1 : 0;

/**
 * @typedef {object} AvailabilityCandidate
 * @property {string} id
 * @property {Date | null} lastSelectedAt
 * @property {Date | null} lastAgentActivityAt
 * @property {Date | null} lastSyncedAt
 * @property {Date} createdAt
 */

/**
 * @param {AvailabilityCandidate[]} candidates
 * @param {number} limit
 * @returns {Set<string>}
 */
export function availableProjectIds(candidates: AvailabilityCandidate[], limit: number): Set<string> {
  if (!Array.isArray(candidates)) throw new Error("candidates must be an array");
  if (limit !== Infinity && (!Number.isSafeInteger(limit) || limit < 0)) {
    throw new Error("limit must be a non-negative safe integer or Infinity");
  }

  const ids = new Set();
  const normalized = candidates.map((candidate) => {
    if (candidate === null || typeof candidate !== "object") throw new Error("candidate must be an object");
    if (typeof candidate.id !== "string" || candidate.id.length === 0) throw new Error("candidate id must be a non-empty string");
    if (ids.has(candidate.id)) throw new Error(`duplicate candidate id: ${candidate.id}`);
    ids.add(candidate.id);

    return {
      id: candidate.id,
      lastSelectedAt: nullableTimestamp(candidate.lastSelectedAt, "lastSelectedAt"),
      lastAgentActivityAt: nullableTimestamp(candidate.lastAgentActivityAt, "lastAgentActivityAt"),
      lastSyncedAt: nullableTimestamp(candidate.lastSyncedAt, "lastSyncedAt"),
      createdAt: timestamp(candidate.createdAt, "createdAt"),
    };
  });

  if (limit === Infinity) return new Set(normalized.map((candidate) => candidate.id));

  const sorted = normalized.sort((left, right) =>
    compareNullableDesc(left.lastSelectedAt, right.lastSelectedAt)
    || compareNullableDesc(left.lastAgentActivityAt, right.lastAgentActivityAt)
    || compareNullableDesc(left.lastSyncedAt, right.lastSyncedAt)
    || right.createdAt - left.createdAt
    || compareId(left.id, right.id),
  );
  return new Set(sorted.slice(0, limit).map((candidate) => candidate.id));
}

/** @param {AvailabilityCandidate[]} candidates @param {ReadonlySet<string>} selected @param {boolean} trimmed */
export function availabilityBasis(candidates: AvailabilityCandidate[], selected: ReadonlySet<string>, trimmed: boolean): "user-selection" | "recent-agent-activity" | "recent-project-sync" | "recent-registration" | null {
  if (!trimmed) return null;
  const kept = candidates.filter((p) => selected.has(p.id));
  if (kept.some((p) => p.lastSelectedAt !== null)) return "user-selection";
  if (kept.some((p) => p.lastAgentActivityAt !== null)) return "recent-agent-activity";
  if (kept.some((p) => p.lastSyncedAt !== null)) return "recent-project-sync";
  return "recent-registration";
}

/** @param {{fromPlan: string, toPlan: string, currentIds: string[], candidates: AvailabilityCandidate[]}} input */
export function availabilityAfterPlanChange({ fromPlan, toPlan, currentIds, candidates }: { fromPlan: string; toPlan: string; currentIds: string[]; candidates: AvailabilityCandidate[] }): { changed: boolean; addedProjectIds: string[]; removedProjectIds: string[]; availableProjectIds: string[]; basis: ReturnType<typeof availabilityBasis> } {
  const fromLimit = limitsFor(fromPlan).projects;
  const toLimit = limitsFor(toPlan).projects;
  const all = availableProjectIds(candidates, Infinity);
  if (new Set(currentIds).size !== currentIds.length || all.size !== currentIds.length || currentIds.some((id) => !all.has(id))) {
    throw new Error("availability candidates must match the current set");
  }
  const trimmed = toLimit < fromLimit && all.size > toLimit;
  const selected = trimmed ? availableProjectIds(candidates, toLimit) : all;
  return {
    changed: trimmed,
    addedProjectIds: /** @type {string[]} */ ([]),
    removedProjectIds: currentIds.filter((id) => !selected.has(id)).sort(),
    availableProjectIds: [...selected].sort(),
    basis: availabilityBasis(candidates, selected, trimmed),
  };
}

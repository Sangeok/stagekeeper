import os from "node:os";
import path from "node:path";

export function usageInputReason(options) {
  if (!options || typeof options !== "object" || Array.isArray(options)
    || Object.keys(options).some(key => !["worktreePath", "signal", "observationTimeoutMs"].includes(key))) return "invalid-input";
  const { worktreePath, signal, observationTimeoutMs = 20000 } = options;
  if (typeof worktreePath !== "string" || !path.isAbsolute(worktreePath) || worktreePath.includes("\0")
    || signal !== undefined && !(signal instanceof AbortSignal)
    || !Number.isInteger(observationTimeoutMs) || observationTimeoutMs < 1 || observationTimeoutMs > 20000) return "invalid-input";
  return signal?.aborted ? "cancelled" : null;
}

export function createUsageResult() {
  return {
    status: "unknown", target: null, holders: [], reasons: [],
    capability: { status: "unqualified", profile: null, reason: "qualification-incomplete" },
    observationPerformed: false,
    observation: { at: new Date().toISOString(), platform: process.platform, architecture: process.arch, release: os.release(),
      scope: "current-account-all-sessions-non-zombie-cwd", coverageComplete: false, profile: null, processCount: 0, missingCount: 0,
      snapshotAttempts: 0, populationChanges: 0, diagnostics: {}, durationMs: 0, outputBytes: 0 },
    observer: { state: "not-started", pid: null, scratchRetained: false },
  };
}

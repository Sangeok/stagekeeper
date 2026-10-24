import path from "node:path";

const phases = new Set(["operation", "read-json", "state-schema", "state-write", "guard-create"]);
const files = new Map([["watch.json", "policy"], ["watch.lock.json", "lock"], ["watch.guard", "guard"],
  ["owner.json", "guard-owner"], ["background.json", "status"], ["autostart.json", "autostart"]]);
const systemCodes = new Set(["ENOENT", "EACCES", "EPERM", "EBUSY", "ENOTDIR", "EISDIR", "EINVAL", "EIO", "EMFILE",
  "ENFILE", "ENOSPC", "EROFS", "ENAMETOOLONG", "EEXIST", "ERR_INVALID_ARG_TYPE"]);
const errorKinds = new Set(["Error", "SyntaxError", "TypeError", "RangeError", "AbortError"]);

export function stateDiagnostic(phase, file, error) {
  return Object.freeze({ phase: phases.has(phase) ? phase : "operation", target: files.get(path.basename(file ?? "")) ?? "unknown",
    errorKind: errorKinds.has(error?.name) ? error.name : "unknown", systemCode: systemCodes.has(error?.code) ? error.code : null });
}

export function readStateDiagnostic(error) {
  const value = error?.diagnostic;
  if (!value || !phases.has(value.phase) || ![...files.values(), "unknown"].includes(value.target)) return stateDiagnostic("operation", undefined, error);
  return { phase: value.phase, target: value.target, errorKind: errorKinds.has(value.errorKind) ? value.errorKind : "unknown",
    systemCode: systemCodes.has(value.systemCode) ? value.systemCode : null };
}

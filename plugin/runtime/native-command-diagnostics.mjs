const stages = new Set([
  "modules", "request", "compile", "compiler-cleanup", "launch", "validation", "validation-local-path",
  "validation-alias", "validation-profile", "prepare-empty", "prepare-sid", "prepare-acl", "validation-bounds",
  "validation-cwd", "profile-create", "profile-sid", "snapshot-acl", "drive-map", "stdio-pipes", "process-attributes",
  "process-create", "token-audit", "job-assign", "process-resume", "job-execution", "job-quiescence", "drive-cleanup", "profile-cleanup",
]);
const boundaries = new Set(["spawn", "helper-exit", "ack-timeout", "ack-json", "ack-shape"]);
const signals = new Set(["SIGTERM", "SIGKILL", "SIGINT", "SIGABRT", "SIGSEGV", "SIGPIPE", "SIGHUP"]);
const systemCodes = new Set(["ENOENT", "EACCES", "EPERM", "EAGAIN", "EMFILE", "ENFILE", "ENOMEM", "EINVAL", "UNKNOWN"]);
const integer = value => Number.isSafeInteger(value) ? value : null;

export function nativeCommandFailure(boundary, { terminal = {}, stdout = "", stderr = "", stderrBytes = 0, systemCode } = {}) {
  const failures = stderr.split(/\r?\n/).flatMap(line => {
    try {
      const value = JSON.parse(line);
      return value?.error === "native-helper-failed" && stages.has(value.stage) && Number.isSafeInteger(value.hresult)
        ? [{ stage: value.stage, hresult: value.hresult, nativeErrorCode: integer(value.nativeErrorCode) }] : [];
    } catch { return []; }
  });
  const failure = failures.at(-1), diagnostic = Object.freeze({
    boundary: boundaries.has(boundary) ? boundary : "unknown", exitCode: integer(terminal.code),
    signal: signals.has(terminal.terminalSignal) ? terminal.terminalSignal : null,
    systemCode: systemCodes.has(systemCode) ? systemCode : null,
    helperStage: failure?.stage ?? null, hresult: failure?.hresult ?? null, nativeErrorCode: failure?.nativeErrorCode ?? null,
    stdoutBytes: Buffer.byteLength(stdout), stderrBytes: Math.max(0, integer(stderrBytes) ?? 0),
    stderrKind: stderrBytes > 8192 ? "overflow" : stderrBytes === 0 ? "empty" : failure ? "structured" : "unrecognized",
  });
  const details = [diagnostic.boundary, `exit ${diagnostic.exitCode ?? "unknown"}`, `stderr ${diagnostic.stderrKind}`,
    `stdout-bytes ${diagnostic.stdoutBytes}`, `stderr-bytes ${diagnostic.stderrBytes}`];
  if (diagnostic.signal) details.push(diagnostic.signal);
  if (diagnostic.systemCode) details.push(diagnostic.systemCode);
  if (failure) details.push(failure.stage, `HRESULT ${failure.hresult}`);
  if (diagnostic.nativeErrorCode !== null) details.push(`Win32 ${diagnostic.nativeErrorCode}`);
  const message = boundary === "ack-json" || boundary === "ack-shape" ? "Native helper acknowledgement differs" : "Native helper ended without acknowledgement";
  return Object.assign(new Error(`${message} (${details.join("; ")}); ownership retained`), { code: "native-helper-unacknowledged", diagnostic });
}

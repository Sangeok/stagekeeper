import { RoleFileInputError, RoleFileRevisionError, RolePathMissingError } from "./role-files.mjs";
import { RoleCommandInputError } from "./role-commands.mjs";
import { RoleGitInputError, RoleGitPathMissingError } from "./role-git.mjs";
import { McpDomainError } from "./mcp-client.mjs";
import { readNativeCommandDiagnostic } from "./native-command-diagnostics.mjs";

const reasons = new Map([
  ["Absolute file path required", "file-path"], ["Device and network paths refused", "file-path"],
  ["Ambiguous Windows path refused", "file-path"], ["File permission refused", "file-permission"],
  ["File alias refused", "file-alias"], ["Hard-linked file refused", "file-alias"],
  ["Text file too large or unsupported", "file-type-or-size"], ["Binary file refused", "file-type-or-size"],
  ["Read page too large", "file-page-size"], ["Directory required", "file-type-or-size"],
  ["Directory too large", "file-scan-size"], ["Invalid scan pagination", "invalid-input"],
  ["Unexpected file arguments", "invalid-input"], ["Invalid guarded text write", "invalid-input"],
  ["File changed while opening", "file-changed"], ["File changed while reading", "file-changed"],
  ["File revision changed during write", "file-changed"], ["Temporary file ownership changed", "file-changed"],
  ["Role file broker closed", "closed"], ["Role file operation unavailable", "file-operation"],
  ["Role tool or run closed", "closed"], ["Role request limit or stop", "limit-or-stop"],
  ["Role session no longer active", "ownership"], ["Role bridge stopped", "ownership"],
  ["Role response arrived after stop", "ownership"], ["Local role result arrived after ownership ended", "ownership"],
  ["Local role project mismatch", "binding"], ["Role response binding mismatch", "binding"],
]);
const systemCodes = new Set(["ENOENT", "EACCES", "EPERM", "EBUSY", "ENOTDIR", "EISDIR", "EINVAL", "EIO",
  "EMFILE", "ENFILE", "ENOSPC", "EROFS", "ENAMETOOLONG", "EEXIST", "ERR_ENCODING_INVALID_ENCODED_DATA"]);

export function roleToolDiagnostic(agent, tool, error) {
  const native = readNativeCommandDiagnostic(error);
  const reason = error instanceof RoleFileInputError || error instanceof RoleCommandInputError || error instanceof RoleGitInputError ? "invalid-input"
    : error instanceof RolePathMissingError || error instanceof RoleGitPathMissingError ? "path-missing"
    : error instanceof RoleFileRevisionError ? "file-revision"
    : error instanceof McpDomainError ? "domain-refusal" : native ? "native-helper" : reasons.get(error?.message) ?? "unclassified";
  return { event: "role-tool-failed", agent, tool, reason, systemCode: systemCodes.has(error?.code) ? error.code : null,
    ...(native ? { native } : {}) };
}

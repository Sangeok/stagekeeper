import { createUsageResult, usageInputReason } from "./process-usage-contract.mjs";

export async function inspectWorktreeUsage(options = {}) {
  const result = createUsageResult();
  result.capability.reason = ["darwin", "win32"].includes(process.platform) ? "qualification-incomplete" : "unsupported-platform";
  result.reasons = [usageInputReason(options) ?? (result.capability.reason === "unsupported-platform" ? "unsupported-platform" : "unqualified-profile")];
  return result;
}

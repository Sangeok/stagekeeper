import { matchesMacCloseoutHostV1 } from "./macos-closeout-profile.mjs";
import { createUsageResult, usageInputReason } from "./process-usage-contract.mjs";
import { probeWorktreeUsage } from "./process-usage-probe.mjs";

const profile = {
  id: "darwin-25.2.0-arm64-node26.4.0-lsof4.91-v1", backend: "darwin-lsof-4.91-current-uid-v1",
  evidence: "conditional-macos-final.json", revision: "7a6b8049e796254ccbccd79040c46371d7e88643",
};

export async function inspectWorktreeUsage(options = {}) {
  const result = createUsageResult();
  const inputReason = usageInputReason(options);
  if (inputReason) { result.reasons = [inputReason]; return result; }
  if (matchesMacCloseoutHostV1()) {
    const observed = await probeWorktreeUsage(options);
    const verifiedBackend = observed.observation.profile === profile.backend;
    observed.capability = { status: verifiedBackend ? "qualified" : "unqualified", profile: profile.id,
      reason: verifiedBackend ? null : "backend-not-verified", evidence: profile.evidence, revision: profile.revision };
    if (!verifiedBackend && observed.status !== "unknown") {
      observed.status = "unknown";
      observed.observation.coverageComplete = false;
      observed.reasons = ["profile-mismatch"];
    }
    return observed;
  }
  result.capability.reason = ["darwin", "win32"].includes(process.platform) ? "qualification-incomplete" : "unsupported-platform";
  result.reasons = [result.capability.reason === "unsupported-platform" ? "unsupported-platform" : "unqualified-profile"];
  return result;
}

import os from "node:os";
import { createUsageResult, usageInputReason } from "./process-usage-contract.mjs";
import { probeWorktreeUsage } from "./process-usage-probe.mjs";

const qualifiedProfiles = [
  { platform: "darwin", architecture: "arm64", release: "25.2.0", node: "v26.4.0",
    id: "darwin-25.2.0-arm64-node26.4.0-lsof4.91-v1", backend: "darwin-lsof-4.91-current-uid-v1",
    evidence: "conditional-macos-final.json", revision: "7a6b8049e796254ccbccd79040c46371d7e88643" },
];

export async function inspectWorktreeUsage(options = {}) {
  const result = createUsageResult();
  const inputReason = usageInputReason(options);
  if (inputReason) { result.reasons = [inputReason]; return result; }
  const profile = qualifiedProfiles.find(value => value.platform === process.platform && value.architecture === process.arch
    && value.release === os.release() && value.node === process.version);
  if (profile) {
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

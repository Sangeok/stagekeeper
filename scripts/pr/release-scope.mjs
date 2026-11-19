import { matchesMacCloseoutHostV1 } from "./macos-closeout-profile.mjs";
import { PrFailure, digest, json, runCommand } from "./git-workspace.mjs";

const deviceUuid = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;

export function macReleaseScope(installationId, device, uid, effectiveUid) {
  if (!deviceUuid.test(device) || /^[0-]+$|^[f-]+$/i.test(device)
    || !Number.isSafeInteger(uid) || uid <= 0 || uid !== effectiveUid) return "held";
  return digest(json(["macos-v1", installationId, device.toLowerCase(), uid]));
}

export async function releaseScope(ctx, installationId) {
  if (ctx.ports.releaseScope) {
    const scope = await ctx.ports.releaseScope(installationId);
    return /^[a-f0-9]{64}$/.test(scope) ? scope : "held";
  }
  if (!matchesMacCloseoutHostV1()) return "held";
  try {
    const result = await runCommand(ctx, "/usr/sbin/ioreg", ["-rd1", "-c", "IOPlatformExpertDevice"]);
    const matches = [...result.output.matchAll(/^\s*"IOPlatformUUID"\s*=\s*"([a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12})"\s*$/gim)];
    if (matches.length !== 1) return "held";
    return macReleaseScope(installationId, matches[0][1], process.getuid(), process.geteuid());
  } catch (error) {
    if (!(error instanceof PrFailure) || ctx.signal?.aborted || ctx.unsettled) throw error;
    return "held";
  }
}

import type { ReactElement } from "react";
import { utcMinute } from "@/fsd/shared/lib/relative-time";

export function TokenUsage({ lastUsedAt, usageTrackingStartedAt }: { lastUsedAt: Date | null; usageTrackingStartedAt: Date | null }): ReactElement {
  if (lastUsedAt) {
    return <time className="whitespace-nowrap font-mono text-xs" dateTime={lastUsedAt.toISOString()}>{utcMinute(lastUsedAt)} UTC</time>;
  }
  const tracked = usageTrackingStartedAt !== null;
  const description = tracked ? "No authentication use recorded since tracking began." : "Usage before tracking began is unavailable.";
  return <span title={description}>{tracked ? "Never used" : "Unknown"}<span className="sr-only">. {description}</span></span>;
}

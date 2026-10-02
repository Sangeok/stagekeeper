import type { ReactElement } from "react";
import { utcMinute } from "@/fsd/shared/lib/relative-time";

export function TokenStatus({ revokedAt, expiresAt, at }: { revokedAt: Date | null; expiresAt: Date | null; at: Date }): ReactElement {
  return <span>{revokedAt ? "Revoked" : expiresAt !== null && expiresAt <= at ? "Expired" : "Active"}</span>;
}

export function TokenExpiry({ expiresAt }: { expiresAt: Date | null }): ReactElement {
  return expiresAt ? <time className="whitespace-nowrap font-mono text-xs" dateTime={expiresAt.toISOString()}>{utcMinute(expiresAt)} UTC</time> : <span>No expiry</span>;
}

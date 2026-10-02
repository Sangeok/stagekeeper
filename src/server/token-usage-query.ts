export type TokenUsageKind = "agent" | "owner" | "user";
export type TokenUsageRecorder = (kind: TokenUsageKind, tokenId: string, at: Date) => Promise<void>;

const USAGE_WRITE_INTERVAL_MS = 60_000;

type UsageUpdate = {
  where: { id: string; revokedAt: null; OR: [{ lastUsedAt: null }, { lastUsedAt: { lte: Date } }] };
  data: { lastUsedAt: Date };
};
type UsageDelegate = { updateMany(args: UsageUpdate): Promise<{ count: number }> };
type UsageDb = { projectToken: UsageDelegate; ownerToken: UsageDelegate; userToken: UsageDelegate };

export function makeRecordTokenUsage(db: UsageDb): TokenUsageRecorder {
  const delegates = { agent: db.projectToken, owner: db.ownerToken, user: db.userToken };
  return async (kind, tokenId, at) => {
    // The predicate protects against late requests and revocation across processes.
    // It reduces row writes; every accepted credential still attempts a query.
    await delegates[kind].updateMany({
      where: {
        id: tokenId,
        revokedAt: null,
        OR: [{ lastUsedAt: null }, { lastUsedAt: { lte: new Date(at.getTime() - USAGE_WRITE_INTERVAL_MS) } }],
      },
      data: { lastUsedAt: at },
    });
  };
}

export async function tryRecordTokenUsage(
  recorder: TokenUsageRecorder | undefined,
  kind: TokenUsageKind,
  tokenId: string,
  at: Date,
): Promise<void> {
  if (!recorder) return;
  try {
    await recorder(kind, tokenId, at);
  } catch {
    try {
      console.warn("Token usage recording failed", { kind });
    } catch {
      // Diagnostic failures must not change authentication either.
      return;
    }
  }
}

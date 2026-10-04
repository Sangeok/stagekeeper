export type TokenRow = {
  id: string;
  label: string;
  createdAt: Date;
  revokedAt: Date | null;
  expiresAt: Date | null;
  lastUsedAt: Date | null;
  usageTrackingStartedAt: Date | null;
};

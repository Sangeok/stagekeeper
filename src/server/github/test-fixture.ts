import type { Attempt, Connection, Dependencies, Store, Vault } from "./contracts";

export function githubFixture(options: { connected?: boolean } = {}) {
  let now = new Date("2026-10-23T00:00:00Z"), enabled = true;
  const calls = { exchange: 0, refresh: 0, repositories: 0, revoke: [] as string[] };
  const attempts = new Map<string, Attempt>();
  const deliveries = new Set<string>();
  const vault: Vault = { activeKeyId: "fixture", seal: (value, context) => Buffer.from(JSON.stringify({ value, context })).toString("base64url"),
    open(value, context) { const parsed: { value: string; context: string } = JSON.parse(Buffer.from(value, "base64url").toString()); if (parsed.context !== context) throw new Error("fixture context mismatch"); return parsed.value; } };
  let connection: Connection = { userId: "u", githubId: "7", revision: options.connected === false ? 0 : 4, tokenVersion: 2,
    accessToken: options.connected === false ? null : vault.seal("ghu_fixture", "access:u"), refreshToken: options.connected === false ? null : vault.seal("ghr_fixture", "refresh:u"),
    accessExpiresAt: new Date(now.getTime() + 3600000), refreshExpiresAt: new Date(now.getTime() + 86400000), revokedAt: null, refreshLeaseId: null, refreshLeaseExpiresAt: null };
  const store: Store = {
    connection: async userId => userId === connection.userId ? { ...connection } : null,
    async beginAttempt(attempt) {
      for (const row of attempts.values()) if (row.userId === attempt.userId && row.browserHash === attempt.browserHash) { row.status = "superseded"; row.verifier = null; row.draft = null; }
      const row = { ...attempt, expectedRevision: connection.revision }; attempts.set(row.id, row); return { ...row };
    },
    async claimAttempt(input) {
      const row = [...attempts.values()].find(value => value.stateHash === input.stateHash && value.userId === input.userId && value.browserHash === input.browserHash
        && value.kind === input.kind && value.status === "pending" && value.expiresAt > input.now);
      if (!row) return null;
      row.status = "exchanging"; return { ...row };
    },
    async finishAuthorization(input) {
      const row = attempts.get(input.attempt.id);
      if (!row || row.status !== "exchanging" || connection.revision !== input.attempt.expectedRevision) return false;
      connection = { ...connection, ...input.credentials, revision: connection.revision + 1, tokenVersion: connection.tokenVersion + 1, revokedAt: null, refreshLeaseId: null, refreshLeaseExpiresAt: null };
      row.status = "consumed"; row.verifier = null; row.expectedRevision = connection.revision;
      if (input.installationAttempt) { row.draft = null; attempts.set(input.installationAttempt.id, { ...input.installationAttempt, expectedRevision: connection.revision }); }
      return true;
    },
    async finishInstallation(input) {
      const row = attempts.get(input.attempt.id);
      if (!row || row.status !== "exchanging" || connection.revision !== input.attempt.expectedRevision || connection.revokedAt) return false;
      connection = { ...connection, revision: connection.revision + 1 }; row.status = "consumed"; row.expectedRevision = connection.revision; return true;
    },
    async failAttempt(id, outcome) { const row = attempts.get(id); if (row?.status === "exchanging") { row.status = "failed"; row.verifier = null; row.outcome = outcome; } },
    async draft(userId, browserHash, at, flowId) { const row = [...attempts.values()].reverse().find(value => value.userId === userId && value.browserHash === browserHash
      && (!flowId || value.flowId === flowId) && !["superseded", "cancelled"].includes(value.status) && value.expiresAt > at); return row ? { ...row } : null; },
    async acknowledge(input) { const row = attempts.get(input.id); if (row?.userId === input.userId && row.browserHash === input.browserHash && row.expectedRevision === input.generation) row.draft = null; },
    async cancel(input) { const row = attempts.get(input.id); if (!row || row.userId !== input.userId || row.browserHash !== input.browserHash) return;
      for (const candidate of attempts.values()) if (candidate.flowId === row.flowId && candidate.userId === input.userId && candidate.browserHash === input.browserHash) { candidate.status = "cancelled"; candidate.verifier = null; candidate.draft = null; } },
    async claimRefresh(input) { if (connection.revision !== input.connection.revision || connection.tokenVersion !== input.connection.tokenVersion || connection.refreshLeaseId) return false;
      connection = { ...connection, refreshLeaseId: input.leaseId, refreshLeaseExpiresAt: input.expiresAt }; return true; },
    async finishRefresh(input) { if (connection.revision !== input.connection.revision || connection.tokenVersion !== input.connection.tokenVersion || connection.refreshLeaseId !== input.leaseId) return false;
      connection = { ...connection, ...input.credentials, tokenVersion: connection.tokenVersion + 1, refreshLeaseId: null, refreshLeaseExpiresAt: null }; return true; },
    async stop(userId, revision, at, fence) { if (connection.userId !== userId || connection.revision !== revision || fence && connection.tokenVersion !== fence.tokenVersion
      || fence?.refreshLeaseId !== undefined && connection.refreshLeaseId !== fence.refreshLeaseId) return false;
      connection = { ...connection, revision: revision + 1, tokenVersion: connection.tokenVersion + 1, accessToken: null, refreshToken: null, revokedAt: at, refreshLeaseId: null, refreshLeaseExpiresAt: null };
      for (const row of attempts.values()) { row.status = "cancelled"; row.draft = null; row.verifier = null; } return true; },
    async rememberInstallations(userId, revision) { return connection.userId === userId && connection.revision === revision && !connection.revokedAt; },
    async applyWebhook(input) { if (deliveries.has(input.deliveryId)) return; deliveries.add(input.deliveryId);
      if (input.githubId === connection.githubId) await store.stop(connection.userId, connection.revision, input.now);
      else if (input.installationId) connection = { ...connection, revision: connection.revision + 1 }; },
  };
  const repository = { repositoryId: "2", owner: "org", name: "service", defaultBranch: "release", visibility: "private" as const, archived: false };
  const credentials = () => ({ accessToken: "ghu_new", refreshToken: "ghr_new", accessExpiresAt: new Date(now.getTime() + 3600000), refreshExpiresAt: new Date(now.getTime() + 86400000) });
  const deps: Dependencies = { store, vault, enabled: () => enabled, now: () => now, wait: () => new Promise(resolve => setImmediate(resolve)),
    configuration: { appId: "1", clientId: "client", clientSecret: "secret", slug: "fixture-app", origin: "https://stagekeeper.test" },
    provider: { exchange: async () => { calls.exchange++; return { ok: true, value: credentials() }; }, refresh: async () => { calls.refresh++; return { ok: true, value: credentials() }; },
      user: async () => ({ ok: true, value: "7" }), installations: async () => ({ ok: true, value: { installations: [{ id: "9", suspended: false }], nextPage: null } }),
      repositories: async () => { calls.repositories++; return { ok: true, value: { repositories: [repository], nextPage: null } }; },
      repository: async () => ({ ok: true, value: repository }), revoke: async value => { calls.revoke.push(value); return true; } } };
  return { deps, store, calls, attempts, repository, credentials, advance: (ms: number) => { now = new Date(now.getTime() + ms); },
    setConnection: (value: Partial<Connection>) => { connection = { ...connection, ...value }; }, current: () => ({ ...connection }), setEnabled: (value: boolean) => { enabled = value; } };
}

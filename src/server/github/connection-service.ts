import { createHash, randomBytes, randomUUID } from "node:crypto";
import { z } from "zod";
import type { Attempt, ConnectionView, Dependencies, Draft, RestorableDraft, Result } from "./contracts";
import { failure } from "./failure";
import { accessTokenFor, sealCredentials } from "./token-refresh";

const id = z.string().regex(/^[1-9]\d*$/);
const text = z.string().max(255);
const authorizedSchema = z.object({ source: z.literal("authorized"), repositoryId: id, installationId: id, repositoryPage: z.number().int().min(1).max(10000), owner: text.min(1), name: text.min(1),
  fullName: z.string().max(520), defaultBranch: text.nullable(), visibility: z.enum(["public", "private"]), connectionRevision: z.number().int().nonnegative() });
const draftSchema = z.object({ selection: z.discriminatedUnion("source", [
  z.object({ source: z.literal("url"), url: z.string().max(2048) }),
  z.object({ source: z.literal("direct"), owner: text, repo: text }),
  z.object({ source: z.literal("picker"), repository: z.object({ owner: text, repo: text, repositoryId: id }).nullable() }),
  z.object({ source: z.literal("authorized"), repository: authorizedSchema }),
]), slug: z.string().max(80), name: z.string().max(160), branch: text, slugTouched: z.boolean(), branchTouched: z.boolean(),
  manual: z.boolean(), editing: z.boolean(), urlDraft: z.string().max(2048) });
const startSchema = z.object({ action: z.enum(["authorize", "manage"]), draft: draftSchema });

export function bindingHash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function newAttempt(deps: Dependencies, input: { userId: string; browser: string; kind: Attempt["kind"]; draft: Draft; revision: number; flowId?: string }) {
  const state = randomBytes(32).toString("base64url"), attemptId = randomUUID();
  const verifier = input.kind === "authorization" ? randomBytes(32).toString("base64url") : null;
  const attempt: Attempt = { id: attemptId, flowId: input.flowId ?? attemptId, userId: input.userId, browserHash: bindingHash(input.browser), stateHash: bindingHash(state),
    kind: input.kind, status: "pending", expectedRevision: input.revision, verifier: verifier ? deps.vault.seal(verifier, `verifier:${input.userId}:${attemptId}`) : null,
    draft: deps.vault.seal(JSON.stringify(input.draft), `draft:${input.userId}:${attemptId}`), outcome: null, expiresAt: new Date(deps.now().getTime() + 600000) };
  return { state, verifier, attempt };
}

function installationUrl(deps: Dependencies, state: string): string {
  const url = new URL(`https://github.com/apps/${deps.configuration.slug}/installations/new`);
  url.searchParams.set("state", state);
  return url.toString();
}

function readDraft(deps: Dependencies, attempt: Attempt): Draft | null {
  if (!attempt.draft) return null;
  try {
    const parsed = draftSchema.safeParse(JSON.parse(deps.vault.open(attempt.draft, `draft:${attempt.userId}:${attempt.id}`)));
    return parsed.success ? parsed.data : null;
  } catch { return null; }
}

export async function connectionView(deps: Dependencies, userId: string, browser: string | null): Promise<ConnectionView> {
  const connection = await deps.store.connection(userId);
  const attempt = browser ? await deps.store.draft(userId, bindingHash(browser), deps.now()) : null;
  const notice = attempt?.status === "failed" && attempt.outcome ? failure(attempt.outcome === "ACCOUNT_MISMATCH" ? "ACCOUNT_MISMATCH" : "INVALID_STATE").message : null;
  const status = !connection?.accessToken || connection.revokedAt ? "not-connected"
    : !connection.refreshExpiresAt || connection.refreshExpiresAt <= deps.now() ? "reauth-required" : "connected";
  return { available: deps.enabled(), status, revision: connection?.revision ?? null, notice };
}

export async function startConnection(deps: Dependencies, input: { userId: string; githubId: string; browser: string; body: unknown }): Promise<Result<{ redirectTo: string; attemptId: string }>> {
  if (!deps.enabled()) return failure("UNAVAILABLE");
  const parsed = startSchema.safeParse(input.body);
  if (!parsed.success) return failure("INVALID_INPUT");
  if (parsed.data.action === "manage") {
    const access = await accessTokenFor(deps, input.userId);
    if (!access.ok) return access;
  }
  const created = newAttempt(deps, { userId: input.userId, browser: input.browser, kind: parsed.data.action === "manage" ? "installation" : "authorization", draft: parsed.data.draft, revision: 0 });
  await deps.store.beginAttempt(created.attempt, input.githubId);
  const redirect = parsed.data.action === "manage" ? installationUrl(deps, created.state) : new URL("https://github.com/login/oauth/authorize");
  if (redirect instanceof URL && created.verifier) {
    redirect.search = new URLSearchParams({ client_id: deps.configuration.clientId, redirect_uri: `${deps.configuration.origin}/api/github/connection/callback`,
      state: created.state, code_challenge: createHash("sha256").update(created.verifier).digest("base64url"), code_challenge_method: "S256", scope: "offline_access" }).toString();
  }
  console.info("github repository connection", { outcome: "started" });
  return { ok: true, value: { redirectTo: redirect.toString(), attemptId: created.attempt.id } };
}

async function claim(deps: Dependencies, input: { userId: string; browser: string; state: string; kind: Attempt["kind"] }): Promise<Attempt | null> {
  if (!deps.enabled() || !/^[A-Za-z0-9_-]{43}$/.test(input.state)) return null;
  const attempt = await deps.store.claimAttempt({ userId: input.userId, browserHash: bindingHash(input.browser), stateHash: bindingHash(input.state), kind: input.kind, now: deps.now() });
  if (!attempt) return null;
  const connection = await deps.store.connection(input.userId);
  if (!connection || connection.revision !== attempt.expectedRevision) {
    await deps.store.failAttempt(attempt.id, "STALE_CONNECTION");
    return null;
  }
  return attempt;
}

export async function completeAuthorization(deps: Dependencies, input: { userId: string; githubId: string; browser: string; state: string; code: string | null }): Promise<Result<{ redirectTo: string }>> {
  const attempt = await claim(deps, { ...input, kind: "authorization" });
  if (!attempt) return failure("INVALID_STATE");
  if (!input.code || input.code.length > 512 || !attempt.verifier) {
    await deps.store.failAttempt(attempt.id, "PERMISSION_REQUIRED");
    return failure("PERMISSION_REQUIRED");
  }
  const verifier = deps.vault.open(attempt.verifier, `verifier:${input.userId}:${attempt.id}`);
  const credentials = await deps.provider.exchange(input.code, verifier);
  if (!credentials.ok) { await deps.store.failAttempt(attempt.id, credentials.code); return credentials; }
  let retained = false;
  try {
    const identity = await deps.provider.user(credentials.value.accessToken);
    if (!identity.ok || identity.value !== input.githubId) {
      await deps.store.failAttempt(attempt.id, "ACCOUNT_MISMATCH");
      return failure("ACCOUNT_MISMATCH");
    }
    const installations = await deps.provider.installations(credentials.value.accessToken, 1);
    if (!installations.ok) { await deps.store.failAttempt(attempt.id, installations.code); return installations; }
    const available = installations.value.installations.filter(item => !item.suspended);
    const draft = readDraft(deps, attempt);
    if (!draft) { await deps.store.failAttempt(attempt.id, "INVALID_STATE"); return failure("INVALID_STATE"); }
    const install = available.length || installations.value.nextPage ? null : newAttempt(deps, { userId: input.userId, browser: input.browser, kind: "installation", draft, revision: attempt.expectedRevision + 1, flowId: attempt.flowId });
    if (!deps.enabled() || !await deps.store.finishAuthorization({ attempt, credentials: sealCredentials(deps, input.userId, credentials.value), installationIds: available.map(item => item.id), installationAttempt: install?.attempt ?? null, now: deps.now() })) return failure("STALE_CONNECTION");
    retained = true;
    console.info("github repository connection", { outcome: "authorized", durationMs: Math.max(0, deps.now().getTime() - attempt.expiresAt.getTime() + 600000) });
    return { ok: true, value: { redirectTo: install ? installationUrl(deps, install.state) : `${deps.configuration.origin}/p/new` } };
  } finally {
    if (!retained) await deps.provider.revoke(credentials.value.accessToken);
  }
}

export async function completeInstallation(deps: Dependencies, input: { userId: string; browser: string; state: string; installationId: string }): Promise<Result<{ redirectTo: string }>> {
  const attempt = await claim(deps, { ...input, kind: "installation" });
  if (!attempt) return failure("INVALID_STATE");
  if (!id.safeParse(input.installationId).success) { await deps.store.failAttempt(attempt.id, "INVALID_INPUT"); return failure("INVALID_INPUT"); }
  const access = await accessTokenFor(deps, input.userId);
  if (!access.ok) { await deps.store.failAttempt(attempt.id, access.code); return access; }
  let page: number | null = 1, allowed = false;
  for (let scanned = 0; page && scanned < 100; scanned++) {
    const result = await deps.provider.installations(access.value.token, page);
    if (!result.ok) { await deps.store.failAttempt(attempt.id, result.code); return result; }
    if (result.value.installations.some(item => item.id === input.installationId && !item.suspended)) { allowed = true; break; }
    page = result.value.nextPage;
  }
  if (!allowed) { await deps.store.failAttempt(attempt.id, "PERMISSION_REQUIRED"); return failure("PERMISSION_REQUIRED"); }
  const repositories = await deps.provider.repositories(access.value.token, input.installationId, 1);
  if (!repositories.ok) { await deps.store.failAttempt(attempt.id, repositories.code); return repositories; }
  if (!deps.enabled() || !await deps.store.finishInstallation({ attempt, installationId: input.installationId, now: deps.now() })) return failure("STALE_CONNECTION");
  console.info("github repository connection", { outcome: "installed", durationMs: Math.max(0, deps.now().getTime() - attempt.expiresAt.getTime() + 600000) });
  return { ok: true, value: { redirectTo: `${deps.configuration.origin}/p/new` } };
}

export async function connectionDraft(deps: Dependencies, userId: string, browser: string, flowId: string): Promise<RestorableDraft | null> {
  const attempt = await deps.store.draft(userId, bindingHash(browser), deps.now(), flowId);
  if (!attempt) return null;
  const value = readDraft(deps, attempt);
  return value ? { id: attempt.id, flowId: attempt.flowId, generation: attempt.expectedRevision, value } : null;
}

export async function disconnectList(deps: Dependencies, input: { userId: string; revision: number }): Promise<Result<{ stopped: true; providerRevoked: boolean }>> {
  const connection = await deps.store.connection(input.userId);
  if (!connection || connection.revision !== input.revision) return failure("STALE_CONNECTION");
  let access: string | null = null;
  if (connection.accessToken) {
    try { access = deps.vault.open(connection.accessToken, `access:${input.userId}`); }
    catch { access = null; }
  }
  if (!await deps.store.stop(input.userId, input.revision, deps.now(), { tokenVersion: connection.tokenVersion, refreshLeaseId: connection.refreshLeaseId })) return failure("STALE_CONNECTION");
  const tokenRevoked = access ? await deps.provider.revoke(access) : connection.accessToken === null;
  const providerRevoked = tokenRevoked && connection.refreshLeaseId === null;
  console.info("github repository connection", { outcome: "disconnected", providerRevoked });
  return { ok: true, value: { stopped: true, providerRevoked } };
}

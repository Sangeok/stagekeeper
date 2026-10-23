import { z } from "zod";
import type { AuthorizedRepository, Dependencies, RepositoryPage, Result } from "./contracts";
import { failure } from "./failure";
import { accessTokenFor } from "./token-refresh";

const cursorSchema = z.object({ userId: z.string(), revision: z.number().int().nonnegative(), installationPage: z.number().int().min(1).max(10000),
  index: z.number().int().min(0).max(99), repositoryPage: z.number().int().min(1).max(10000), installationId: z.string().nullable(), expiresAt: z.number() });
const selectionSchema = z.object({ repositoryId: z.string().regex(/^[1-9]\d*$/), installationId: z.string().regex(/^[1-9]\d*$/),
  repositoryPage: z.number().int().min(1).max(10000),
  owner: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9-]{0,99}$/), name: z.string().regex(/^[a-zA-Z0-9_.-]{1,100}$/), connectionRevision: z.number().int().nonnegative() });

export async function authorizedRepositories(deps: Dependencies, userId: string, cursor: string | null): Promise<Result<RepositoryPage>> {
  if (!deps.enabled()) return failure("UNAVAILABLE");
  const access = await accessTokenFor(deps, userId);
  if (!access.ok) return access;
  let position = { userId, revision: access.value.revision, installationPage: 1, index: 0, repositoryPage: 1, installationId: null as string | null, expiresAt: deps.now().getTime() + 600000 };
  if (cursor) {
    try {
      if (cursor.length > 4096) return failure("INVALID_INPUT");
      const parsed = cursorSchema.safeParse(JSON.parse(deps.vault.open(cursor, `cursor:${userId}`)));
      if (!parsed.success || parsed.data.userId !== userId || parsed.data.revision !== access.value.revision || parsed.data.expiresAt <= deps.now().getTime()) return failure("STALE_CONNECTION");
      position = parsed.data;
    } catch { return failure("STALE_CONNECTION"); }
  }
  const installationPage = await deps.provider.installations(access.value.token, position.installationPage);
  if (!installationPage.ok) return installationPage;
  const installations = installationPage.value.installations;
  const installation = installations[position.index];
  if (position.installationId && installation?.id !== position.installationId) return failure("STALE_CONNECTION");
  if (!await deps.store.rememberInstallations(userId, access.value.revision, installations.map(item => item.id))) return failure("STALE_CONNECTION");
  const repositories = installation && !installation.suspended ? await deps.provider.repositories(access.value.token, installation.id, position.repositoryPage) : null;
  if (repositories && !repositories.ok && (repositories.code === "RATE_LIMITED" || repositories.code === "REAUTH_REQUIRED")) return repositories;
  const rows = repositories?.ok ? repositories.value.repositories : [];
  const supported = rows.filter(item => item.visibility !== "unsupported" && !item.archived);
  const failedInstallations = installation && (!repositories || !repositories.ok) ? [installation.id] : [];
  const nextRepositoryPage = repositories?.ok ? repositories.value.nextPage : null;
  const nextInstallation = installations[position.index + 1];
  const next = nextRepositoryPage && installation ? { ...position, repositoryPage: nextRepositoryPage, installationId: installation.id }
    : nextInstallation ? { ...position, index: position.index + 1, repositoryPage: 1, installationId: nextInstallation.id }
    : installationPage.value.nextPage ? { ...position, installationPage: installationPage.value.nextPage, index: 0, repositoryPage: 1, installationId: null } : null;
  const connection = await deps.store.connection(userId);
  if (!deps.enabled() || !connection || connection.revokedAt || connection.revision !== access.value.revision) return failure("STALE_CONNECTION");
  const result: AuthorizedRepository[] = supported.flatMap(item => item.visibility === "unsupported" || !installation ? [] : [{
    source: "authorized", repositoryId: item.repositoryId, owner: item.owner, name: item.name, defaultBranch: item.defaultBranch, visibility: item.visibility,
    installationId: installation.id, repositoryPage: position.repositoryPage, fullName: `${item.owner}/${item.name}`, connectionRevision: access.value.revision }]);
  const unsupportedCount = rows.length - supported.length;
  return { ok: true, value: { repositories: result, connectionRevision: access.value.revision, nextCursor: next ? deps.vault.seal(JSON.stringify(next), `cursor:${userId}`) : null,
    failedInstallations, unsupportedCount, status: failedInstallations.length || unsupportedCount ? "partial" : result.length ? "ready" : "empty" } };
}

export async function validateSelection(deps: Dependencies, userId: string, input: unknown): Promise<Result<AuthorizedRepository>> {
  if (!deps.enabled()) return failure("UNAVAILABLE");
  const parsed = selectionSchema.safeParse(input);
  if (!parsed.success) return failure("INVALID_INPUT");
  const selection = parsed.data;
  const access = await accessTokenFor(deps, userId);
  if (!access.ok) return access;
  if (selection.connectionRevision !== access.value.revision) return failure("STALE_CONNECTION");
  const listed = await deps.provider.repositories(access.value.token, selection.installationId, selection.repositoryPage);
  if (!listed.ok) return listed;
  if (!listed.value.repositories.some(item => item.repositoryId === selection.repositoryId && !item.archived && item.visibility !== "unsupported")) return failure("STALE_CONNECTION");
  const result = await deps.provider.repository(access.value.token, selection);
  if (!result.ok) return result;
  const repository = result.value;
  if (repository.visibility === "unsupported" || repository.archived) return failure("PERMISSION_REQUIRED");
  if (repository.owner !== selection.owner || repository.name !== selection.name) return failure("STALE_CONNECTION");
  const current = await deps.store.connection(userId);
  if (!deps.enabled() || !current || current.revokedAt || current.revision !== access.value.revision) return failure("STALE_CONNECTION");
  return { ok: true, value: { source: "authorized", repositoryId: repository.repositoryId, installationId: selection.installationId, repositoryPage: selection.repositoryPage,
    owner: repository.owner, name: repository.name, fullName: `${repository.owner}/${repository.name}`, defaultBranch: repository.defaultBranch,
    visibility: repository.visibility, connectionRevision: current.revision } };
}

import "server-only";
import { z } from "zod";
import { prisma } from "@/server/db";
import type { ConnectionView, Dependencies, RepositoryPage, RestorableDraft, Result, AuthorizedRepository } from "./contracts";
import { appConfiguration, pickerEnabled, webhookConfiguration } from "./configuration.server";
import { configuredTokenVault } from "./token-vault.server";
import { createGitHubProvider } from "./provider.server";
import { createGitHubStore } from "./store.server";
import { acknowledgeDraft, cancelConnectionAttempt } from "./draft-service";
import { bindingHash, completeAuthorization, completeInstallation, connectionDraft, connectionView, disconnectList, startConnection } from "./connection-service";
import { authorizedRepositories, validateSelection } from "./repositories";
import { processWebhook, validWebhookSignature } from "./webhook";
import { failure } from "./failure";
import { maintainConnections } from "./maintenance.server";

export { listPublicRepos } from "./public-repositories";

function dependencies(): Dependencies | null {
  const configuration = appConfiguration(), vault = configuredTokenVault();
  return configuration && vault ? { configuration, vault, store: createGitHubStore(prisma), provider: createGitHubProvider(configuration),
    enabled: () => pickerEnabled() && webhookConfiguration() !== null, now: () => new Date(), wait: ms => new Promise(resolve => setTimeout(resolve, ms)) } : null;
}

export async function loadRepositoryConnection(userId: string, browser: string | null): Promise<ConnectionView> {
  const deps = dependencies();
  if (!deps) {
    if (process.env.GITHUB_REPOSITORY_APP_ID) {
      try {
        const connection = await createGitHubStore(prisma).connection(userId);
        if (connection?.accessToken && !connection.revokedAt) return { available: false, status: "connected", revision: connection.revision,
          notice: "The repository list is unavailable. You can disconnect it or paste a repository URL." };
      } catch { return { available: false, status: "not-connected", revision: null, notice: null }; }
    }
    return { available: false, status: "not-connected", revision: null, notice: null };
  }
  try { return await connectionView(deps, userId, browser); }
  catch { return { available: false, status: "not-connected", revision: null, notice: null }; }
}

export async function startRepositoryConnection(input: { userId: string; githubId: string; browser: string; body: unknown }): Promise<Result<{ redirectTo: string; attemptId: string }>> {
  const deps = dependencies();
  return deps ? startConnection(deps, input) : failure("UNAVAILABLE");
}

export async function completeRepositoryAuthorization(input: { userId: string; githubId: string; browser: string; state: string; code: string | null }): Promise<Result<{ redirectTo: string }>> {
  const deps = dependencies();
  return deps ? completeAuthorization(deps, input) : failure("UNAVAILABLE");
}

export async function completeRepositoryInstallation(input: { userId: string; browser: string; state: string; installationId: string }): Promise<Result<{ redirectTo: string }>> {
  const deps = dependencies();
  return deps ? completeInstallation(deps, input) : failure("UNAVAILABLE");
}

export async function loadConnectionDraft(userId: string, browser: string, flowId: string): Promise<RestorableDraft | null> {
  const deps = dependencies();
  return deps?.enabled() && z.uuid().safeParse(flowId).success ? connectionDraft(deps, userId, browser, flowId) : null;
}

export async function acknowledgeConnectionDraft(userId: string, browser: string, body: unknown): Promise<Result<null>> {
  return acknowledgeDraft(createGitHubStore(prisma), { userId, browserHash: bindingHash(browser), body });
}

export async function cancelRepositoryConnection(userId: string, browser: string, body: unknown): Promise<Result<null>> {
  return cancelConnectionAttempt(createGitHubStore(prisma), { userId, browserHash: bindingHash(browser), body });
}

export async function disconnectRepositoryList(userId: string, body: unknown): Promise<Result<{ stopped: true; providerRevoked: boolean }>> {
  const parsed = z.object({ revision: z.number().int().nonnegative() }).safeParse(body);
  if (!parsed.success) return failure("INVALID_INPUT");
  const deps = dependencies();
  if (deps) return disconnectList(deps, { userId, revision: parsed.data.revision });
  const store = createGitHubStore(prisma);
  const connection = await store.connection(userId);
  if (!connection || connection.revision !== parsed.data.revision || !await store.stop(userId, parsed.data.revision, new Date())) return failure("STALE_CONNECTION");
  return { ok: true, value: { stopped: true, providerRevoked: connection.accessToken === null } };
}

export async function listAuthorizedRepositories(userId: string, cursor: string | null): Promise<Result<RepositoryPage>> {
  const deps = dependencies();
  return deps ? authorizedRepositories(deps, userId, cursor) : failure("UNAVAILABLE");
}

export async function validateRepositorySelection(userId: string, input: unknown): Promise<Result<AuthorizedRepository>> {
  const deps = dependencies();
  return deps ? validateSelection(deps, userId, input) : failure("UNAVAILABLE");
}

export async function handleGitHubWebhook(input: { body: string; signature: string | null; event: string; deliveryId: string }): Promise<Result<null>> {
  const configuration = webhookConfiguration();
  if (!configuration) return failure("UNAVAILABLE");
  if (!validWebhookSignature(input.body, input.signature, configuration.secret)) return { ...failure("INVALID_STATE"), status: 401 };
  return processWebhook(createGitHubStore(prisma), { ...input, appId: configuration.appId, now: new Date() });
}

export async function maintainGitHubConnections(rotate: boolean): Promise<{ attemptsDeleted: number; deliveriesDeleted: number; connectionsExpired: number; credentialsRotated: number }> {
  return maintainConnections(prisma, { now: new Date(), vault: rotate ? configuredTokenVault() : null, rotate });
}

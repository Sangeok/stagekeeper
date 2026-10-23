import "server-only";
import { z } from "zod";
import type { AppConfiguration, Credentials, Provider, ProviderRepository, Result } from "./contracts";
import { failure } from "./failure";

const numericId = z.union([z.number().int().positive().max(Number.MAX_SAFE_INTEGER), z.string().regex(/^[1-9]\d*$/)]).transform(String);
const repositorySchema = z.object({ id: numericId, name: z.string().min(1), owner: z.object({ login: z.string().min(1) }),
  default_branch: z.string().min(1).nullable().optional(), visibility: z.string(), archived: z.boolean() });
const installationSchema = z.object({ id: numericId, app_id: numericId, suspended_at: z.string().nullable(),
  permissions: z.record(z.string(), z.string()) });
const tokenSchema = z.object({ access_token: z.string().min(1), refresh_token: z.string().min(1), token_type: z.literal("bearer"),
  expires_in: z.number().int().positive().max(86400), refresh_token_expires_in: z.number().int().positive().max(366 * 86400) });

function repository(value: z.infer<typeof repositorySchema>): ProviderRepository {
  return { repositoryId: value.id, owner: value.owner.login, name: value.name, defaultBranch: value.default_branch ?? null,
    visibility: value.visibility === "public" || value.visibility === "private" ? value.visibility : "unsupported", archived: value.archived };
}

function nextPage(response: Response, path: string, page: number): number | null {
  const next = response.headers.get("link")?.split(",").find(part => /;\s*rel="next"/.test(part))?.match(/<([^>]+)>/)?.[1];
  if (!next) return null;
  const url = new URL(next);
  if (url.origin !== "https://api.github.com" || url.pathname !== path || url.username || url.password || url.hash
    || url.searchParams.get("page") !== String(page + 1) || url.searchParams.get("per_page") !== "100") throw new Error("Invalid GitHub pagination");
  return page + 1;
}

export function createGitHubProvider(configuration: AppConfiguration, request: typeof fetch = fetch): Provider {
  async function call(path: string, token: string): Promise<Result<{ body: unknown; response: Response }>> {
    try {
      let url = new URL(path, "https://api.github.com");
      let response: Response | undefined;
      for (let redirects = 0; redirects < 3; redirects++) {
        response = await request(url, { cache: "no-store", redirect: "manual", signal: AbortSignal.timeout(10000),
          headers: { Accept: "application/vnd.github+json", Authorization: `Bearer ${token}`, "X-GitHub-Api-Version": "2026-03-10" } });
        if (response.status !== 301 && response.status !== 302 && response.status !== 307 && response.status !== 308) break;
        const location = response.headers.get("location");
        if (!location) return failure("UNAVAILABLE");
        url = new URL(location, url);
        if (url.origin !== "https://api.github.com" || url.username || url.password || url.hash
          || !/^\/(?:repositories\/[1-9]\d*|repos\/[^/]+\/[^/]+)$/.test(url.pathname)) return failure("UNAVAILABLE");
      }
      if (!response) return failure("UNAVAILABLE");
      if (!response.ok) {
        if (response.status === 401) return failure("REAUTH_REQUIRED");
        if (response.status === 429 || response.status === 403 && (response.headers.get("x-ratelimit-remaining") === "0" || response.headers.has("retry-after"))) {
          const retry = Number(response.headers.get("retry-after") ?? 60);
          return failure("RATE_LIMITED", Number.isFinite(retry) ? Math.max(1, Math.min(3600, Math.ceil(retry))) : 60);
        }
        return failure(response.status === 403 || response.status === 404 ? "PERMISSION_REQUIRED" : "UNAVAILABLE");
      }
      const body = await response.text();
      if (body.length > 4_000_000) return failure("UNAVAILABLE");
      return { ok: true, value: { body: JSON.parse(body) as unknown, response } };
    } catch {
      console.error("github repository request failed", { category: "request" });
      return failure("UNAVAILABLE");
    }
  }

  async function token(parameters: Record<string, string>): Promise<Result<Credentials>> {
    try {
      const response = await request("https://github.com/login/oauth/access_token", { method: "POST", cache: "no-store", redirect: "error",
        signal: AbortSignal.timeout(10000), headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ client_id: configuration.clientId, client_secret: configuration.clientSecret, ...parameters }) });
      if (!response.ok) return failure("REAUTH_REQUIRED");
      const parsed = tokenSchema.safeParse(await response.json());
      if (!parsed.success) return failure("REAUTH_REQUIRED");
      const now = Date.now();
      return { ok: true, value: { accessToken: parsed.data.access_token, refreshToken: parsed.data.refresh_token,
        accessExpiresAt: new Date(now + parsed.data.expires_in * 1000), refreshExpiresAt: new Date(now + parsed.data.refresh_token_expires_in * 1000) } };
    } catch {
      console.error("github repository request failed", { category: "token" });
      return failure("UNAVAILABLE");
    }
  }

  return {
    exchange: (code, verifier) => token({ code, code_verifier: verifier, redirect_uri: `${configuration.origin}/api/github/connection/callback` }),
    refresh: refreshToken => token({ grant_type: "refresh_token", refresh_token: refreshToken }),
    async user(accessToken) {
      const result = await call("/user", accessToken);
      if (!result.ok) return result;
      const parsed = z.object({ id: numericId }).safeParse(result.value.body);
      return parsed.success ? { ok: true, value: parsed.data.id } : failure("UNAVAILABLE");
    },
    async installations(accessToken, page) {
      const path = "/user/installations";
      const result = await call(`${path}?per_page=100&page=${page}`, accessToken);
      if (!result.ok) return result;
      const parsed = z.object({ installations: z.array(installationSchema) }).safeParse(result.value.body);
      if (!parsed.success || parsed.data.installations.some(item => item.app_id !== configuration.appId
        || Object.entries(item.permissions).some(([name, permission]) => name !== "metadata" && permission !== "none")
        || item.permissions.metadata !== "read")) return failure("UNAVAILABLE");
      try {
        return { ok: true, value: { installations: parsed.data.installations.map(item => ({ id: item.id, suspended: item.suspended_at !== null })), nextPage: nextPage(result.value.response, path, page) } };
      } catch { return failure("UNAVAILABLE"); }
    },
    async repositories(accessToken, installationId, page) {
      const path = `/user/installations/${encodeURIComponent(installationId)}/repositories`;
      const result = await call(`${path}?per_page=100&page=${page}`, accessToken);
      if (!result.ok) return result;
      const parsed = z.object({ repositories: z.array(repositorySchema) }).safeParse(result.value.body);
      if (!parsed.success) return failure("UNAVAILABLE");
      try { return { ok: true, value: { repositories: parsed.data.repositories.map(repository), nextPage: nextPage(result.value.response, path, page) } }; }
      catch { return failure("UNAVAILABLE"); }
    },
    async repository(accessToken, input) {
      const result = await call(`/repos/${encodeURIComponent(input.owner)}/${encodeURIComponent(input.name)}`, accessToken);
      if (!result.ok) return result;
      const parsed = repositorySchema.safeParse(result.value.body);
      if (!parsed.success) return failure("UNAVAILABLE");
      if (parsed.data.id !== input.repositoryId) return failure("STALE_CONNECTION");
      return { ok: true, value: repository(parsed.data) };
    },
    async revoke(accessToken) {
      try {
        const response = await request(`https://api.github.com/applications/${encodeURIComponent(configuration.clientId)}/token`, {
          method: "DELETE", cache: "no-store", redirect: "error", signal: AbortSignal.timeout(10000),
          headers: { Accept: "application/vnd.github+json", "Content-Type": "application/json",
            Authorization: `Basic ${Buffer.from(`${configuration.clientId}:${configuration.clientSecret}`).toString("base64")}`, "X-GitHub-Api-Version": "2026-03-10" },
          body: JSON.stringify({ access_token: accessToken }),
        });
        return response.status === 204;
      } catch { return false; }
    },
  };
}

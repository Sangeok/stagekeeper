import "server-only";
import { recordTokenUsage } from "@/server/tokens/api.server";
import { limitAccountRequest } from "@/server/usage/api.server";
import type { RestRateFailure } from "./response";
import { prisma } from "@/server/db";
import { registerRepositoryProject, REPO_SEGMENT, RESERVED_SLUGS, SLUG_RE } from "@/server/projects/api";
import { resolveUserScope } from "./scope";
import { findUserTokenByHash } from "@/server/tokens/api.server";

export type RegisterProjectResponse =
  | { ok: true; created: boolean; project: { owner: string; repo: string; branch: string; name: string; slug: string } }
  | { ok: false; status: 400 | 401 | 403 | 409; reason: string; reconnectSlug?: string } | (RestRateFailure & { reconnectSlug?: never });

const field = (body: unknown, key: string): string | null => {
  if (typeof body !== "object" || body === null) return null;
  const value = (body as Record<string, unknown>)[key];
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
};

export async function registerProject(
  authorizationHeader: string | null,
  body: unknown,
): Promise<RegisterProjectResponse> {
  const scope = await resolveUserScope(findUserTokenByHash, authorizationHeader, recordTokenUsage);
  if (!scope.ok) return scope;
  const limited = await limitAccountRequest(scope.userId);
  if (limited) return { ...limited, status: 429 };

  const owner = field(body, "owner");
  const repo = field(body, "repo");
  const branch = field(body, "branch") ?? "main";
  if (!owner || !repo) return { ok: false, status: 400, reason: "owner and repo are required" };
  if (!REPO_SEGMENT.test(owner) || !REPO_SEGMENT.test(repo)) {
    return { ok: false, status: 400, reason: "owner and repo must be GitHub names — letters, numbers, dots, dashes, underscores" };
  }

  const slug = field(body, "slug") ?? undefined;
  if (slug !== undefined && (!SLUG_RE.test(slug) || RESERVED_SLUGS.has(slug))) {
    return { ok: false, status: 400, reason: "slug must be 2–40 lowercase letters, numbers, or dashes, start with a letter or number, and not be reserved" };
  }

  const input = {
    userId: scope.userId,
    owner,
    repo,
    branch,
    name: field(body, "name") ?? undefined,
    slug,
  };

  const result = await registerRepositoryProject(prisma, input);
  switch (result.status) {
    case "created":
    case "existing": return { ok: true, created: result.status === "created", project: result.project };
    case "capped": return { ok: false, status: 403, reason: result.reason };
    case "disconnected": return { ok: false, status: 409, reason: result.reason, reconnectSlug: result.slug };
    case "integrity":
    case "vanished":
    case "conflict": return { ok: false, status: 409, reason: result.reason };
    default: { const unreachable: never = result; return unreachable; }
  }
}

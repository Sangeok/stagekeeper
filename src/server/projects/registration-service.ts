import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import type { ServerResult } from "../result";
import { DISCONNECTED_REASON, ProjectIntegrityError, repositoryOwner, type TransactionHost } from "./access-query";
import { AvailabilityConflict, withAvailabilityTransaction } from "./availability-service";
import { registerProjectResultIn, type RegisterProjectInput, type RegisterProjectResult } from "./registration-command";

type WebProjectInput = RegisterProjectInput & { slug: string; initialTokenHash: string };
type RepositoryInput = Omit<RegisterProjectInput, "initialTokenHash">;
type RepositoryProject = { owner: string; repo: string; branch: string; name: string; slug: string };
type RepositoryRegistrationResult =
  | { status: "created" | "existing"; project: RepositoryProject }
  | { status: "disconnected"; reason: string; slug: string }
  | { status: "capped" | "integrity" | "vanished" | "conflict"; reason: string };

function isSlugConflict(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002"
    && JSON.stringify(error.meta?.target ?? error.meta?.driverAdapterError ?? "").includes("slug");
}

// The caller retains the one-time plaintext; only its hash crosses this boundary.
export async function registerWebProject(client: TransactionHost, input: WebProjectInput): Promise<ServerResult<RegisterProjectResult>> {
  try {
    const item = await withAvailabilityTransaction(client, (tx) => registerProjectResultIn(tx, input));
    return { ok: true, item };
  } catch (error) {
    if (error instanceof AvailabilityConflict) return { ok: false, reason: error.message };
    if (isSlugConflict(error)) return { ok: false, reason: `'${input.slug}' is already taken.` };
    throw error;
  }
}

export async function registerRepositoryProject(
  client: TransactionHost & Pick<PrismaClient, "project">,
  input: RepositoryInput,
): Promise<RepositoryRegistrationResult> {
  // A slug race retries the entire registration once. It must never return another owner's row.
  for (let attempt = 0; ; attempt += 1) {
    try {
      const result = await withAvailabilityTransaction(client, (tx) => registerProjectResultIn(tx, input));
      if (result.status === "capped" || result.status === "integrity") return { status: result.status, reason: result.reason };
      if (result.status === "disconnected") return { status: "disconnected", reason: result.reason, slug: result.slug };
      // Preserve the committed snapshot read: the row may disappear or disconnect after commit.
      const row = await client.project.findUnique({
        where: { id: result.projectId },
        select: { repoOwner: true, repo: true, branch: true, name: true, slug: true, disconnectedAt: true },
      });
      if (!row) return { status: "vanished", reason: "the project vanished while registering — try again" };
      if (row.disconnectedAt != null) return { status: "disconnected", reason: DISCONNECTED_REASON, slug: row.slug };
      return {
        status: result.status,
        project: { owner: repositoryOwner(row.repoOwner), repo: row.repo, branch: row.branch, name: row.name, slug: row.slug },
      };
    } catch (error) {
      if (error instanceof ProjectIntegrityError) return { status: "integrity", reason: error.message };
      if (error instanceof AvailabilityConflict) return { status: "conflict", reason: error.message };
      if (!isSlugConflict(error) || attempt === 1) throw error;
    }
  }
}

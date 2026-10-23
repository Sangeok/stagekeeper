"use server";
import { newToken } from "@harness/core/tokens/token.mjs";
import { requireUser } from "@/server/auth/guard";
import { registerWebProject } from "@/server/projects/api.server";
import { validateRepositorySelection } from "@/server/github/api.server";
import type { CreateProjectState } from "../model/create-project-state";
import { RESERVED_SLUGS, SLUG_ERROR, SLUG_RE } from "../model/project-slug";
import { SEGMENT } from "../model/repo-url";
import { toCreateProjectState } from "../model/create-project-result";

const field = (form: FormData, name: string) => String(form.get(name) ?? "").trim();

export async function createProject(_prev: CreateProjectState, form: FormData): Promise<CreateProjectState> {
  const { userId } = await requireUser();
  const expectedUserId = field(form, "expectedUserId");
  if (expectedUserId && expectedUserId !== userId) return { status: "error", error: "Your account changed. Reload before creating a project." };
  const startedAt = Date.now();
  const slug = field(form, "slug");
  const owner = field(form, "owner");
  const repo = field(form, "repo");
  const source = field(form, "repositorySource") || "manual";
  if (!["manual", "public", "authorized"].includes(source)) return { status: "error", error: "Check the repository selection." };
  const branch = field(form, "branch") || (source === "authorized" ? "" : "main");
  const name = field(form, "name") || slug;
  if (!SLUG_RE.test(slug)) return { status: "error", error: SLUG_ERROR };
  if (RESERVED_SLUGS.has(slug)) return { status: "error", error: `'${slug}' is reserved.` };
  if (!owner || !repo) return { status: "error", error: "GitHub owner and repo are required." };
  if (!SEGMENT.test(owner) || !SEGMENT.test(repo)) {
    return { status: "error", error: "GitHub owner and repo must be GitHub names — letters, numbers, dots, dashes, underscores." };
  }
  if (source === "authorized") {
    if (!branch) return { status: "error", error: "Enter a branch for this repository." };
    try {
      const verified = await validateRepositorySelection(userId, { repositoryId: field(form, "repositoryId"), installationId: field(form, "installationId"),
        repositoryPage: Number(field(form, "repositoryPage")),
        connectionRevision: Number(field(form, "connectionRevision")), owner, name: repo });
      if (!verified.ok) return { status: "error", error: verified.message };
    } catch {
      console.error("project registration", { source, outcome: "repository-unavailable" });
      return { status: "error", error: "The repository list is unavailable. Reload it or paste a repository URL." };
    }
  }
  const { plain, hash } = newToken();
  let result: Awaited<ReturnType<typeof registerWebProject>>;
  try { result = await registerWebProject({ userId, slug, name, owner, repo, branch, initialTokenHash: hash }); }
  catch (error) {
    if (source !== "authorized") throw error;
    console.error("project registration", { source, outcome: "unconfirmed", durationMs: Date.now() - startedAt });
    return { status: "error", error: "Couldn't confirm whether the project was created. Check Projects before trying again." };
  }
  console.info("project registration", { source, outcome: result.ok ? result.item.status : "rejected", durationMs: Date.now() - startedAt });
  return result.ok ? toCreateProjectState(result.item, plain) : { status: "error", error: result.reason };
}

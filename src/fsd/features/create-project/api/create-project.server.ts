"use server";
import { newToken } from "@harness/core/tokens/token.mjs";
import { requireUser } from "@/server/auth/guard";
import { registerWebProject } from "@/server/projects/api.server";
import type { CreateProjectState } from "../model/create-project-state";
import { RESERVED_SLUGS, SLUG_ERROR, SLUG_RE } from "../model/project-slug";
import { SEGMENT } from "../model/repo-url";
import { toCreateProjectState } from "../model/create-project-result";

const field = (form: FormData, name: string) => String(form.get(name) ?? "").trim();

export async function createProject(_prev: CreateProjectState, form: FormData): Promise<CreateProjectState> {
  const { userId } = await requireUser();
  const slug = field(form, "slug");
  const owner = field(form, "owner");
  const repo = field(form, "repo");
  const branch = field(form, "branch") || "main";
  const name = field(form, "name") || slug;
  if (!SLUG_RE.test(slug)) return { status: "error", error: SLUG_ERROR };
  if (RESERVED_SLUGS.has(slug)) return { status: "error", error: `'${slug}' is reserved.` };
  if (!owner || !repo) return { status: "error", error: "GitHub owner and repo are required." };
  if (!SEGMENT.test(owner) || !SEGMENT.test(repo)) {
    return { status: "error", error: "GitHub owner and repo must be GitHub names — letters, numbers, dots, dashes, underscores." };
  }
  const { plain, hash } = newToken();
  const result = await registerWebProject({ userId, slug, name, owner, repo, branch, initialTokenHash: hash });
  return result.ok ? toCreateProjectState(result.item, plain) : { status: "error", error: result.reason };
}

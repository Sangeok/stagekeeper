import "server-only";
import { z } from "zod";
import type { PublicRepo, PublicReposResult } from "./contracts";

const githubRepoSchema = z.object({
  id: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  owner: z.object({ login: z.string().min(1) }),
  name: z.string(),
  default_branch: z.string().catch("main"),
  archived: z.boolean().catch(false),
});

export async function listPublicRepos(login: string): Promise<PublicReposResult> {
  try {
    const response = await fetch(
      `https://api.github.com/users/${encodeURIComponent(login)}/repos?sort=updated&per_page=100`,
      {
        headers: {
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
        },
        next: { revalidate: 300 },
      },
    );
    if (!response.ok) {
      console.error("github repositories unavailable", { category: "http", status: response.status });
      return { ok: false, category: "http" };
    }
    const body: unknown = await response.json().catch(() => null);
    if (!Array.isArray(body)) {
      console.error("github repositories unavailable", { category: "shape" });
      return { ok: false, category: "shape" };
    }
    const repos: PublicRepo[] = [];
    for (const raw of body) {
      const parsed = githubRepoSchema.safeParse(raw);
      if (!parsed.success || parsed.data.archived) continue;
      repos.push({ source: "public", repositoryId: String(parsed.data.id), owner: parsed.data.owner.login, name: parsed.data.name, defaultBranch: parsed.data.default_branch });
    }
    return { ok: true, repos };
  } catch {
    console.error("github repositories unavailable", { category: "request" });
    return { ok: false, category: "request" };
  }
}

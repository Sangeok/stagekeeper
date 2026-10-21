import "server-only";
import { z } from "zod";

export type PublicRepo = { name: string; defaultBranch: string };
export type PublicReposResult = { ok: true; repos: PublicRepo[] } | { ok: false; category: "http" | "shape" | "request" };

const githubRepoSchema = z.object({
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
      repos.push({ name: parsed.data.name, defaultBranch: parsed.data.default_branch });
    }
    return { ok: true, repos };
  } catch (error) {
    console.error("github repositories unavailable", { category: "request", error });
    return { ok: false, category: "request" };
  }
}

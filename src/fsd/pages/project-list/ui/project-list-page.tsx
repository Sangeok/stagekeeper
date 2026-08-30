import Link from "next/link";

import { ButtonLink } from "@/fsd/shared/ui/button";

export type ProjectSummary = { slug: string; name: string; owner: string; repo: string };

export function ProjectListPage({ projects }: { projects: ProjectSummary[] }) {
  return (
    <main className="mx-auto flex w-full max-w-[800px] flex-col gap-8 px-5 pt-9 pb-14">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Projects</h1>
        <ButtonLink variant="mine" href="/p/new">
          New project
        </ButtonLink>
      </div>
      {projects.length === 0 ? (
        <p className="text-sm text-quiet">No projects yet. Connect a repository to get a board, a backlog, and an inbox.</p>
      ) : (
        <ul className="rounded-lg border border-rule bg-paper">
          {projects.map((p) => (
            <li key={p.slug} className="border-b border-rule last:border-b-0">
              <Link href={`/p/${p.slug}`} className="flex flex-wrap items-baseline gap-3 px-3.5 py-3 hover:bg-field">
                <span className="font-medium">{p.name}</span>
                <span className="font-mono text-xs text-quiet">
                  {p.owner}/{p.repo}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

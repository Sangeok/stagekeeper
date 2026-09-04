import Link from "next/link";

import { projectPath } from "@/fsd/shared/routes/project";
import { ButtonLink } from "@/fsd/shared/ui/button";

export type ProjectSummary = { slug: string; name: string; owner: string; repo: string; locked?: boolean };

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
              <Link href={projectPath(p.slug)} className="flex flex-wrap items-baseline gap-3 px-3.5 py-3 hover:bg-field">
                <span className="font-medium">{p.name}</span>
                <span className="font-mono text-xs text-quiet">
                  {p.owner}/{p.repo}
                </span>
                {/* 잠긴 프로젝트도 목록에 남는다 — 행을 지우지 않고 배지로 알린다. 플랜을 올리면 그대로 열린다. */}
                {p.locked ? (
                  <span className="rounded-full border border-line px-2 py-0.5 text-xs text-quiet">Locked</span>
                ) : null}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

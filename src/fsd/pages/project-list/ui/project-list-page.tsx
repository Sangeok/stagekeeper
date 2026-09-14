import Link from "next/link";

import { projectPath } from "@/fsd/shared/routes/project";
import { ButtonLink } from "@/fsd/shared/ui/button";
import { UseProjectControl, selectionControlKey, type ProjectSelectionModel, type SelectProjectAction } from "@/fsd/features/select-project-for-use";

export type ProjectListModel = Omit<ProjectSelectionModel, "projects"> & {
  login: string;
  availableCount: number;
  projects: (ProjectSelectionModel["projects"][number] & { slug: string; repoOwner: string; repo: string })[];
  notice: { basis: string | null; availableProjectIds: string[]; at: string } | null;
};

export function ProjectListPage({ model, useProject }: { model: ProjectListModel; useProject: SelectProjectAction }) {
  const { projects } = model;
  return (
    <main className="mx-auto flex w-full max-w-[800px] flex-col gap-8 px-5 pt-9 pb-14">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-semibold tracking-tight">Projects</h1>
          <p className="text-sm text-quiet">{model.limit === null ? `${model.availableCount} available · unlimited` : `${model.availableCount} / ${model.limit} available`}</p>
        </div>
        <ButtonLink variant="mine" href="/p/new">
          New project
        </ButtonLink>
      </div>
      {model.notice ? <p className="text-sm text-quiet">After your plan changed, these projects remained available: {projects.filter((p) => model.notice?.availableProjectIds.includes(p.id)).map((p) => p.name).join(", ")}.
        Selection basis: {model.notice.basis?.replaceAll("-", " ") ?? "project order"}. You can change the selection below.</p> : null}
      {projects.length === 0 ? (
        <p className="text-sm text-quiet">No projects yet. Connect a repository to get a board, a backlog, and an inbox.</p>
      ) : (
        <ul className="rounded-lg border border-rule bg-paper">
          {projects.map((p) => (
            <li key={p.slug} className="flex flex-wrap items-center justify-between gap-3 border-b border-rule px-3.5 py-3 last:border-b-0">
              <Link href={projectPath(p.slug)} className="flex flex-wrap items-baseline gap-3 px-3.5 py-3 hover:bg-field">
                <span className="font-medium">{p.name}</span>
                <span className="font-mono text-xs text-quiet">
                  {p.repoOwner}/{p.repo}
                </span>
              </Link>
              <span className="text-xs text-quiet">{p.available ? "Available" : "Not selected"}</span>
              <UseProjectControl key={selectionControlKey(p.id, model)} targetId={p.id} model={model} action={useProject} />
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

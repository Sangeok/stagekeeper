import Link from "next/link";

import { projectPath } from "@/fsd/shared/routes/project";
import { newProjectPath } from "@/fsd/shared/routes/projects";
import { ButtonLink } from "@/fsd/shared/ui/button";
import { UseProjectControl, availabilityLabel, selectionControlKey, type ProjectSelectionModel, type SelectProjectAction } from "@/fsd/features/select-project-for-use";
import { ProjectConnectionControl, connectionControlKey, type ProjectConnectionModel, type ProjectConnectionAction } from "@/fsd/features/manage-project-connection";

export type ProjectListModel = Omit<ProjectSelectionModel, "projects"> & {
  login: string;
  connectedCount: number; writesEnabled: boolean;
  projects: (ProjectSelectionModel["projects"][number] & { slug: string; repoOwner: string; repo: string; disconnectedAt: string | null })[];
  notice: { basis: string | null; availableProjectIds: string[]; at: string } | null;
};

export function ProjectListPage({ model, action, disconnect, reconnect }: { model: ProjectListModel; action: SelectProjectAction; disconnect: ProjectConnectionAction; reconnect: ProjectConnectionAction }) {
  const { projects } = model;
  const connected = projects.filter((p) => p.disconnectedAt === null);
  const disconnected = projects.filter((p) => p.disconnectedAt !== null);
  const selection = { ...model, projects: connected };
  const connection: ProjectConnectionModel = model;
  return (
    <main className="mx-auto flex w-full max-w-[800px] flex-col gap-8 px-5 pt-9 pb-14">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-semibold tracking-tight">Projects</h1>
          <p className="text-sm text-quiet">{availabilityLabel(model)}</p>
          <p className="text-sm text-quiet">{model.connectedCount} / {model.limit ?? "unlimited"} connected</p>
        </div>
        <ButtonLink variant="mine" href={newProjectPath()}>
          New project
        </ButtonLink>
      </div>
      {model.notice ? <p className="text-sm text-quiet">After your plan changed, these projects remained available: {projects.filter((p) => model.notice?.availableProjectIds.includes(p.id)).map((p) => p.name).join(", ")}.
        Selection basis: {model.notice.basis?.replaceAll("-", " ") ?? "project order"}. You can change the selection below.</p> : null}
      {projects.length === 0 ? (
        <p className="text-sm text-quiet">No projects yet. Connect a repository to get a board, a backlog, and an inbox.</p>
      ) : (
        <div className="flex flex-col gap-6">
        {[{ label: "Connected", rows: connected, emptyMessage: "No connected repositories. Connect a new repository or reconnect a preserved project below." },
          { label: "Disconnected", rows: disconnected, emptyMessage: "No disconnected repositories." }].map((group) => (
        <section key={group.label} className="flex flex-col gap-2">
          <h2 className="text-sm font-medium">{group.label}</h2>
          {group.rows.length === 0 ? <p className="text-sm text-quiet">{group.emptyMessage}</p> : (
          <ul className="rounded-lg border border-rule bg-paper">
          {group.rows.map((p) => (
            <li key={p.slug} className="flex flex-wrap items-center justify-between gap-3 border-b border-rule px-3.5 py-3 last:border-b-0">
              <Link href={projectPath(p.slug)} className="flex flex-wrap items-baseline gap-3 px-3.5 py-3 hover:bg-field">
                <span className="font-medium">{p.name}</span>
                <span className="font-mono text-xs text-quiet">
                  {p.repoOwner}/{p.repo}
                </span>
              </Link>
              {/* 배지와 Use 버튼은 한 묶음 — 행이 justify-between이라 따로 두면 배지가 행 가운데로 밀린다. */}
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-xs text-quiet">{p.disconnectedAt !== null ? "Disconnected" : p.available ? "Available" : "Not selected"}</span>
                {p.disconnectedAt === null ? <UseProjectControl key={selectionControlKey(p.id, selection)} targetId={p.id} model={selection} action={action} /> : null}
                <ProjectConnectionControl key={connectionControlKey(p.id, connection)} targetId={p.id} model={connection} disconnect={disconnect} reconnect={reconnect} />
              </div>
            </li>
          ))}
          </ul>)}
        </section>))}
        </div>
      )}
    </main>
  );
}

import Link from "next/link";

import { cn } from "@/fsd/shared/lib/class-name";
import { billingPath } from "@/fsd/shared/routes/billing";
import { projectPath } from "@/fsd/shared/routes/project";
import { newProjectPath } from "@/fsd/shared/routes/projects";
import { ButtonLink } from "@/fsd/shared/ui/button";
import { UseProjectControl, selectionControlKey, type ProjectSelectionModel, type SelectProjectAction } from "@/fsd/features/select-project-for-use";
import { ProjectConnectionControl, connectionControlKey, type ProjectConnectionSummary, type ProjectConnectionAction } from "@/fsd/features/manage-project-connection";
import { activityLines, connectionSummary, NOT_SELECTED_BOUNDARY, selectionNotice } from "../model/project-list-copy";

export type ProjectListModel = Omit<ProjectSelectionModel, "projects"> & {
  login: string;
  connectedCount: number;
  projects: (ProjectSelectionModel["projects"][number] & { slug: string; repoOwner: string; repo: string; branch: string; disconnectedAt: string | null })[];
  notice: { basis: string | null; availableProjectIds: string[]; at: string } | null;
};
type ProjectRow = ProjectListModel["projects"][number];
type Props = { model: ProjectListModel; action: SelectProjectAction; disconnect: ProjectConnectionAction; reconnect: ProjectConnectionAction };

// 연결 수는 한 문장(connectionSummary)으로만 말한다. 사용 가능 수는 연결 수와 다를 때만 보인다 — 위의 안내와
// 목록 안의 경계 줄. 평소엔 모든 행이 사용 중이라 행마다 상태 글자를 붙이지 않는다(product-copy.md §10).
export function ProjectListPage({ model, action, disconnect, reconnect }: Props) {
  const { projects } = model;
  const connected = projects.filter((p) => p.disconnectedAt === null);
  const inUse = connected.filter((p) => p.available);
  const notSelected = connected.filter((p) => !p.available);
  const disconnected = projects.filter((p) => p.disconnectedAt !== null);
  const selection = { ...model, projects: connected };
  const connection: ProjectConnectionSummary = { plan: model.plan, limit: model.limit, version: model.version, connectedCount: model.connectedCount };
  const summary = connectionSummary(model);
  const kept = model.notice ? { names: projects.filter((p) => model.notice?.availableProjectIds.includes(p.id)).map((p) => p.name), basis: model.notice.basis } : null;
  const notice = notSelected.length > 0
    ? selectionNotice({ plan: model.plan, limit: model.limit, notSelectedCount: notSelected.length, over: summary.over, kept }) : null;
  const grouped = disconnected.length > 0;

  const row = (p: ProjectRow) => {
    const isDisconnected = p.disconnectedAt !== null;
    return (
      <li key={p.slug} className="flex flex-wrap items-center gap-x-4 gap-y-3 border-b border-rule px-4 py-3 first:rounded-t-lg last:rounded-b-lg last:border-b-0 has-[>a:hover]:bg-field">
        <Link href={projectPath(p.slug)} className="flex min-w-0 flex-[1_1_10rem] flex-col gap-1">
          <span className={cn("text-[15px] leading-5 font-medium [overflow-wrap:anywhere]", isDisconnected && "text-quiet")}>{p.name}</span>
          <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-quiet">
            <span className="font-mono [overflow-wrap:anywhere]">{p.repoOwner}/{p.repo}</span>
            {isDisconnected
              ? <span>Disconnected <span className="font-mono">{p.disconnectedAt?.slice(0, 10)}</span></span>
              : <code className="rounded-sm border border-rule px-1.5 text-ink">{p.branch}</code>}
          </span>
        </Link>
        {!isDisconnected ? <span className="flex flex-col text-right text-xs text-quiet tabular-nums">
          {activityLines(p.openItems, p.openRuns).map((line) => <span key={line}>{line}</span>)}
        </span> : null}
        {!isDisconnected ? <UseProjectControl key={selectionControlKey(p.id, selection)} targetId={p.id} model={selection} action={action} /> : null}
        <ProjectConnectionControl key={connectionControlKey(p.id, connection)} target={{ id: p.id, name: p.name, repoOwner: p.repoOwner, repo: p.repo, disconnectedAt: p.disconnectedAt }} summary={connection} disconnect={disconnect} reconnect={reconnect} />
      </li>
    );
  };

  return (
    <main className="mx-auto flex w-full max-w-[800px] flex-col gap-7 px-5 pt-9 pb-14">
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">Projects</h1>
          <p>{summary.line}</p>
          {summary.full && !summary.over ? <p className="text-sm text-quiet">
            To connect another, disconnect one or <Link href={billingPath()} className="text-mine underline underline-offset-2">compare plans</Link>.
          </p> : null}
        </div>
        <ButtonLink variant={summary.full ? "quiet" : "mine"} href={newProjectPath()}>
          New project
        </ButtonLink>
      </div>
      {notice ? <div className="flex max-w-[68ch] flex-col gap-1.5 rounded-lg bg-field px-4 py-3 text-sm">
        {notice.map((line, index) => <p key={line} className={cn(index === notice.length - 1 && "text-quiet")}>{line}</p>)}
      </div> : null}
      {projects.length === 0 ? (
        <p className="text-sm text-quiet">No projects yet. Connect a repository to get a board, a backlog, and an inbox.</p>
      ) : (
        <div className="flex flex-col gap-6">
          <section aria-label="Connected repositories" className="flex flex-col gap-2">
            {grouped ? <h2 className="text-sm font-medium">Connected</h2> : null}
            {connected.length === 0
              ? <p className="text-sm text-quiet">No connected repositories. Connect a new repository or reconnect a preserved project below.</p>
              : <ul className="rounded-lg border border-rule bg-paper">
                {inUse.map(row)}
                {notSelected.length > 0 ? <li className="border-b border-rule bg-field px-4 py-2 text-xs text-quiet">{NOT_SELECTED_BOUNDARY}</li> : null}
                {notSelected.map(row)}
              </ul>}
          </section>
          {grouped ? <section aria-label="Disconnected repositories" className="flex flex-col gap-2">
            <h2 className="text-sm font-medium">Disconnected</h2>
            <ul className="rounded-lg border border-rule bg-paper">{disconnected.map(row)}</ul>
          </section> : null}
        </div>
      )}
    </main>
  );
}

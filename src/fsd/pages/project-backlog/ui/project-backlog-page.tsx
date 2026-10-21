import Link from "next/link";
import { BacklogForm, RemoveBacklogButton, type BacklogFormAction, type RemoveBacklogAction } from "@/fsd/features/edit-backlog";
import { ProposeButton, type ProposeAction } from "@/fsd/features/propose-item";
import { backlogHref } from "@/fsd/shared/routes/project";
import { BacklogTable, type BacklogRow } from "./backlog-table";

type Props = {
  canWrite: boolean;
  slug: string;
  rows: BacklogRow[];
  includeRemoved: boolean;
  editing?: { item: { key: string; title: string; area: string; source: string; type: string | null }; update: BacklogFormAction };
  add: BacklogFormAction;
  remove: RemoveBacklogAction;
  propose: ProposeAction;
  roster: string[];
  pipelines: { id: string; name: string }[];
  preselected: Record<string, string>;
};

export function ProjectBacklogPage({ slug, rows, includeRemoved, editing, add, remove, propose, roster, canWrite, pipelines, preselected }: Props) {
  return (
    <>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Backlog</h1>
        <Link
          href={backlogHref(slug, { includeRemoved: !includeRemoved })}
          className="text-xs text-quiet underline underline-offset-2"
        >
          {includeRemoved ? "Hide removed" : "Show removed"}
        </Link>
      </div>
      <BacklogTable
        canWrite={canWrite}
        slug={slug}
        rows={rows}
        renderRowActions={(row) => (
          <>
            {row.status === null ? <ProposeButton key={row.key} itemKey={row.key} pipelines={pipelines} preselected={preselected[row.key]} roster={roster} propose={propose} /> : null}
            <RemoveBacklogButton itemKey={row.key} remove={remove} />
          </>
        )}
      />
      {canWrite ? editing ? <BacklogForm key={editing.item.key} action={editing.update} item={editing.item} /> : <BacklogForm key="new" action={add} /> : null}
    </>
  );
}

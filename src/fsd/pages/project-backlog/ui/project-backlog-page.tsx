import Link from "next/link";
import { BacklogForm, BacklogTable, type BacklogFormAction, type BacklogRow, type RemoveBacklogAction } from "@/fsd/features/edit-backlog";
import { backlogHref } from "@/fsd/shared/routes/project";

type Props = {
  slug: string;
  rows: BacklogRow[];
  includeRemoved: boolean;
  editing?: { key: string; title: string; area: string; source: string };
  add: BacklogFormAction;
  // 편집할 항목이 있을 때만 온다 — 없을 때 add로 대신 채우면 "수정"이 조용히 새 항목을 만든다.
  update?: BacklogFormAction;
  remove: RemoveBacklogAction;
};

export function ProjectBacklogPage({ slug, rows, includeRemoved, editing, add, update, remove }: Props) {
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
      <BacklogTable slug={slug} rows={rows} remove={remove} />
      {editing && update ? <BacklogForm action={update} item={editing} /> : <BacklogForm action={add} />}
    </>
  );
}

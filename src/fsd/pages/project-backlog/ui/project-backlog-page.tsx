import Link from "next/link";
import { BacklogForm, BacklogTable, RemoveBacklogButton, type BacklogFormAction, type BacklogRow, type RemoveBacklogAction } from "@/fsd/features/edit-backlog";
import { ProposeButton, type ProposeAction } from "@/fsd/features/propose-item";
import { backlogHref } from "@/fsd/shared/routes/project";

type Props = {
  canWrite: boolean;
  slug: string;
  rows: BacklogRow[];
  includeRemoved: boolean;
  // 편집할 항목과 그 수정 액션은 함께 온다 — 항목만 있고 add로 대신 채우면 "수정"이 조용히 새 항목을 만든다.
  editing?: { item: { key: string; title: string; area: string; source: string }; update: BacklogFormAction };
  add: BacklogFormAction;
  remove: RemoveBacklogAction;
  propose: ProposeAction;
  roster: string[];
};

export function ProjectBacklogPage({ slug, rows, includeRemoved, editing, add, remove, propose, roster, canWrite }: Props) {
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
            {/* 보드에 올리기는 아직 보드에 없는 항목에만 — 올라간 항목은 보드 상태 열이 말한다. */}
            {row.status === null ? <ProposeButton itemKey={row.key} roster={roster} propose={propose} /> : null}
            <RemoveBacklogButton itemKey={row.key} remove={remove} />
          </>
        )}
      />
      {canWrite ? editing ? <BacklogForm key={editing.item.key} action={editing.update} item={editing.item} /> : <BacklogForm key="new" action={add} /> : null}
    </>
  );
}

import Link from "next/link";
import type { ReactNode } from "react";

import { statusLabel } from "@/fsd/entities/board-item";
import { Chip } from "@/fsd/shared/ui/chip";
import { backlogHref } from "@/fsd/shared/routes/project";
import { Table, Td, Th, Tr } from "@/fsd/shared/ui/table";

export type BacklogRow = {
  key: string;
  title: string;
  area: string;
  source: string;
  status: string | null;
  removedAt: Date | null;
};

type Props = {
  canWrite: boolean;
  slug: string;
  rows: BacklogRow[];
  // §E.7 — 제거되지 않은 행의 마지막 열. pages 층이 채운다(보드에 올리기·제거) — 같은 layer의 다른 slice를
  // 여기서 import하지 않고, 이 표가 쓰지 않는 액션을 prop으로 통과시키지 않는다. canWrite일 때만 부른다.
  renderRowActions?: (row: BacklogRow) => ReactNode;
};

// 서버 컴포넌트다 — 상호작용하는 조각은 마지막 열의 슬롯(renderRowActions)이 채우고,
// 실패 문구도 그 행 아래에 붙는다(표 상단 공유 줄이 아니라).
export function BacklogTable({ slug, rows, renderRowActions, canWrite }: Props) {
  return (
    <div className="flex flex-col gap-2">
      <Table>
        <thead>
          <tr>
            <Th>Key</Th>
            <Th>Title</Th>
            <Th>Area</Th>
            <Th>Board status</Th>
            <Th />
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <Tr>
              <Td colSpan={5} className="text-quiet">
                {canWrite ? "No backlog items yet. Add the first one below." : "No backlog items yet."}
              </Td>
            </Tr>
          ) : null}
          {rows.map((row) => (
            <Tr key={row.key} className={row.removedAt ? "text-quiet" : undefined}>
              <Td className="font-mono text-xs">{row.key}</Td>
              <Td>
                {canWrite ? <Link href={backlogHref(slug, { edit: row.key })} className="hover:underline">
                  {row.title}
                </Link> : <details><summary className="cursor-pointer">{row.title}</summary><p className="mt-2 text-xs text-quiet">Source</p><p className="whitespace-pre-wrap">{row.source}</p></details>}
              </Td>
              <Td className="font-mono text-xs text-quiet">{row.area}</Td>
              <Td>{row.status ? <Chip tone="done">{statusLabel(row.status)}</Chip> : <span className="text-xs text-quiet">Not on board</span>}</Td>
              <Td className="text-right">
                {row.removedAt ? (
                  <span className="text-xs">Removed</span>
                ) : canWrite && renderRowActions ? (
                  renderRowActions(row)
                ) : null}
              </Td>
            </Tr>
          ))}
        </tbody>
      </Table>
    </div>
  );
}

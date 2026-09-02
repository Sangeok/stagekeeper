import Link from "next/link";

import { statusLabel } from "@/fsd/entities/board-item";
import { Chip } from "@/fsd/shared/ui/chip";
import { backlogHref } from "@/fsd/shared/routes/project";
import { Table, Td, Th, Tr } from "@/fsd/shared/ui/table";
import type { RemoveBacklogAction } from "../model/backlog-form-state";
import { RemoveBacklogButton } from "./remove-backlog-button";

export type BacklogRow = {
  key: string;
  title: string;
  area: string;
  status: string | null;
  removedAt: Date | null;
};

type Props = {
  slug: string;
  rows: BacklogRow[];
  remove: RemoveBacklogAction;
};

// 서버 컴포넌트다 — 상호작용하는 조각은 마지막 열의 RemoveBacklogButton 하나뿐이고,
// 실패 문구도 그 행 아래에 붙는다(표 상단 공유 줄이 아니라).
export function BacklogTable({ slug, rows, remove }: Props) {
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
                No backlog items yet. Add the first one below.
              </Td>
            </Tr>
          ) : null}
          {rows.map((row) => (
            <Tr key={row.key} className={row.removedAt ? "text-quiet" : undefined}>
              <Td className="font-mono text-xs">{row.key}</Td>
              <Td>
                <Link href={backlogHref(slug, { edit: row.key })} className="hover:underline">
                  {row.title}
                </Link>
              </Td>
              <Td className="font-mono text-xs text-quiet">{row.area}</Td>
              <Td>{row.status ? <Chip tone="done">{statusLabel(row.status)}</Chip> : <span className="text-xs text-quiet">Not on board</span>}</Td>
              <Td className="text-right">
                {row.removedAt ? (
                  <span className="text-xs">Removed</span>
                ) : (
                  <RemoveBacklogButton itemKey={row.key} remove={remove} />
                )}
              </Td>
            </Tr>
          ))}
        </tbody>
      </Table>
    </div>
  );
}

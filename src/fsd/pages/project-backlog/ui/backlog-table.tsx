import Link from "next/link";
import type { ReactNode } from "react";

import { statusLabel } from "@/fsd/entities/board-item";
import { Chip } from "@/fsd/shared/ui/chip";
import { backlogHref } from "@/fsd/shared/routes/project";
import { Table, Td, Th, Tr } from "@/fsd/shared/ui/table";

export type BacklogRow = {
  key: string;
  title: string;
  type: string | null;
  addedBy: string;
  removedReason: string | null;
  area: string;
  source: string;
  status: string | null;
  removedAt: Date | null;
};

type Props = {
  canWrite: boolean;
  slug: string;
  rows: BacklogRow[];
  renderRowActions?: (row: BacklogRow) => ReactNode;
};

export function BacklogTable({ slug, rows, renderRowActions, canWrite }: Props) {
  return (
    <div className="flex flex-col gap-2">
      <Table>
        <thead>
          <tr>
            <Th>Key</Th>
            <Th>Type</Th>
            <Th>Title</Th>
            <Th>Added by</Th>
            <Th>Area</Th>
            <Th>Board status</Th>
            <Th />
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <Tr>
              <Td colSpan={7} className="text-quiet">
                {canWrite ? "No backlog items yet. Run the pipeline in your coding client and feature-scout adds the ones it has evidence for, or add one below." : "No backlog items yet."}
              </Td>
            </Tr>
          ) : null}
          {rows.map((row) => (
            <Tr key={row.key} className={row.removedAt ? "text-quiet" : undefined}>
              <Td className="font-mono text-xs">{row.key}</Td>
              <Td>{row.type ? <Chip tone="done">{row.type}</Chip> : "—"}</Td>
              <Td>
                {canWrite ? <Link href={backlogHref(slug, { edit: row.key })} className="hover:underline">
                  {row.title}
                </Link> : <details><summary className="cursor-pointer">{row.title}</summary><p className="mt-2 text-xs text-quiet">Source</p><p className="whitespace-pre-wrap">{row.source}</p></details>}
              </Td>
              <Td className="text-xs">{row.addedBy === "feature-scout" ? "feature-scout" : "You"}</Td>
              <Td className="font-mono text-xs text-quiet">{row.area || "—"}</Td>
              <Td>{row.status ? <Chip tone="done">{statusLabel(row.status)}</Chip> : <span className="text-xs text-quiet">Not on board</span>}</Td>
              <Td className="text-right">
                {row.removedAt ? (
                  <span className="text-xs">{row.removedReason === "done" ? "Done" : row.removedReason === "discarded" ? "Discarded" : "Removed"}</span>
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

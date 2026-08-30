"use client";
import Link from "next/link";
import { useState, useTransition } from "react";

import { statusLabel } from "@/fsd/entities/board-item";
import { Button } from "@/fsd/shared/ui/button";
import { Chip } from "@/fsd/shared/ui/chip";
import { Table, Td, Th, Tr } from "@/fsd/shared/ui/table";

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
  remove: (key: string) => Promise<{ error?: string }>;
};

export function BacklogTable({ slug, rows, remove }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex flex-col gap-2">
      {error ? <p className="text-sm text-risk">{error}</p> : null}
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
                <Link href={`/p/${slug}/backlog?edit=${row.key}`} className="hover:underline">
                  {row.title}
                </Link>
              </Td>
              <Td className="font-mono text-xs text-quiet">{row.area}</Td>
              <Td>{row.status ? <Chip tone="done">{statusLabel(row.status)}</Chip> : <span className="text-xs text-quiet">Not on board</span>}</Td>
              <Td className="text-right">
                {row.removedAt ? (
                  <span className="text-xs">Removed</span>
                ) : (
                  <Button
                    size="sm"
                    disabled={pending}
                    onClick={() =>
                      startTransition(async () => {
                        const result = await remove(row.key);
                        setError(result.error ?? null);
                      })
                    }
                  >
                    Remove
                  </Button>
                )}
              </Td>
            </Tr>
          ))}
        </tbody>
      </Table>
    </div>
  );
}

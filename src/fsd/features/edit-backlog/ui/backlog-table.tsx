"use client";
import Link from "next/link";
import { useState, useTransition } from "react";

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
    <div className="space-y-2">
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      <table className="w-full text-left text-sm">
        <thead className="border-b border-zinc-200 text-xs uppercase text-zinc-500">
          <tr>
            <th className="py-2">key</th>
            <th className="py-2">Title</th>
            <th className="py-2">Area</th>
            <th className="py-2">Board status</th>
            <th className="py-2" />
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100">
          {rows.map((row) => (
            <tr key={row.key} className={row.removedAt ? "text-zinc-400" : undefined}>
              <td className="py-2 font-mono text-xs">{row.key}</td>
              <td className="py-2">
                <Link href={`/p/${slug}/backlog?edit=${row.key}`} className="hover:underline">
                  {row.title}
                </Link>
              </td>
              <td className="py-2 text-xs text-zinc-500">{row.area}</td>
              <td className="py-2">
                {row.status ? (
                  <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs">{row.status}</span>
                ) : (
                  <span className="text-xs text-zinc-400">Not on board</span>
                )}
              </td>
              <td className="py-2 text-right">
                {row.removedAt ? (
                  <span className="text-xs">Removed</span>
                ) : (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() =>
                      startTransition(async () => {
                        const result = await remove(row.key);
                        setError(result.error ?? null);
                      })
                    }
                    className="rounded-md border border-zinc-300 px-3 py-1 text-xs disabled:opacity-50"
                  >
                    Remove
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

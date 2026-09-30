import Link from "next/link";
import type { ReactElement } from "react";
import { DOC_LINK_NOTE } from "@/fsd/entities/board-item";
import type { HistoryRowView } from "../model/history-row";

export function HistoryList({ rows, showReportNote = true }: {
  rows: readonly HistoryRowView[]; showReportNote?: boolean;
}): ReactElement {
  return (
    <>
      <ol className="rounded-lg border border-rule bg-paper">
        {rows.map(row => (
          <li key={row.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-rule px-3.5 py-2.5 text-sm last:border-b-0">
            {row.key !== undefined ? (
              row.keyHref ? <Link href={row.keyHref} className="font-mono text-xs underline underline-offset-2">{row.key}</Link>
                : <span className="font-mono text-xs text-quiet">{row.key}</span>
            ) : null}
            <time dateTime={row.at.toISOString()} className="font-mono text-xs whitespace-nowrap text-quiet">{row.time}</time>
            <span className="font-mono text-xs break-all text-quiet">{row.actor}</span>
            {row.source === "report" ? (
              <a href={row.href} target="_blank" rel="noreferrer" className="min-w-0 break-words underline underline-offset-2">
                {row.text} · <span className="font-mono text-xs">{row.commit}</span> ↗
              </a>
            ) : (
              <>
                <span className="min-w-0 font-mono text-xs break-words">{row.text}</span>
                {row.note ? <span className="min-w-0 text-xs break-words text-quiet">({row.note})</span> : null}
              </>
            )}
          </li>
        ))}
      </ol>
      {showReportNote && rows.some(row => row.source === "report") ? <p className="mt-1.5 text-xs text-quiet">{DOC_LINK_NOTE}</p> : null}
    </>
  );
}

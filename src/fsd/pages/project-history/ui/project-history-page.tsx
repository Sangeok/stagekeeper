import Link from "next/link";
import type { ReactElement } from "react";
import { HistoryList, toHistoryRows, HISTORY_TRUNCATED_NOTE } from "@/fsd/widgets/history-feed";
import { cn } from "@/fsd/shared/lib/class-name";
import { historyHref } from "../model/history-navigation";
import type { ProjectHistoryProps } from "../model/history-view";
import { HistoryItemsList } from "./history-items-list";

export function ProjectHistoryPage(props: ProjectHistoryProps): ReactElement {
  const { slug, mode, nextCursor, hasBefore, historyTruncated } = props;
  const location = mode === "events" ? { mode, view: props.view } : { mode };
  return (
    <section className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-3">
        <h1 className="text-xl font-semibold tracking-tight">History</h1>
        <nav aria-label="History view" className="flex gap-4 text-sm">
          {([ ["items", "Items"], ["events", "Events"] ] as const).map(([id, label]) => (
            <Link key={id} href={historyHref(slug, { mode: id })} aria-current={mode === id ? "page" : undefined}
              className={cn("border-b-2 border-transparent pb-1 text-quiet hover:text-ink", mode === id && "border-ink font-medium text-ink")}>
              {label}
            </Link>
          ))}
        </nav>
      </div>
      {mode === "items" ? <HistoryItemsList {...props} /> : <HistoryEvents {...props} />}
      {historyTruncated ? <p className="text-xs text-quiet">{HISTORY_TRUNCATED_NOTE}</p> : null}
      {hasBefore || nextCursor !== null ? (
        <nav aria-label="History pages" className="flex flex-wrap justify-between gap-4 text-sm">
          {hasBefore ? <Link href={historyHref(slug, location)} className="underline underline-offset-2">← Newest</Link> : null}
          {nextCursor !== null ? <Link href={historyHref(slug, { ...location, before: nextCursor })} className="ml-auto underline underline-offset-2">Older →</Link> : null}
        </nav>
      ) : null}
    </section>
  );
}

function HistoryEvents({ slug, view, events, reports, repo, currentRounds }: Extract<ProjectHistoryProps, { mode: "events" }>): ReactElement {
  const rows = toHistoryRows(events, reports, { repo, order: "desc", keyLinks: { slug, currentRounds } });
  return (
    <div>
      <nav aria-label="Event filter" className="mb-3 flex gap-4 text-xs">
        {([ ["key", "Key events"], ["all", "All"] ] as const).map(([id, label]) => (
          <Link key={id} href={historyHref(slug, { mode: "events", view: id })} aria-current={view === id ? "page" : undefined}
            className={cn("text-quiet hover:text-ink", view === id && "font-medium text-ink underline underline-offset-4")}>{label}</Link>
        ))}
      </nav>
      {rows.length > 0 ? <HistoryList rows={rows} /> : (
        <div className="rounded-lg border border-rule bg-paper px-3.5 py-6 text-sm text-quiet">
          <p>{view === "key" ? "No key events yet." : "Nothing has happened yet."}</p>
          {view === "key" ? <Link href={historyHref(slug, { mode: "events", view: "all" })}
            className="mt-2 inline-block text-ink underline underline-offset-2">Show all</Link> : null}
        </div>
      )}
    </div>
  );
}

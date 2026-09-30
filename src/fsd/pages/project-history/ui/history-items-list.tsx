import Link from "next/link";
import { statusLabel } from "@/fsd/entities/board-item";
import { HistoryList, toHistoryRows } from "@/fsd/widgets/history-feed";
import { utcMinute } from "@/fsd/shared/lib/relative-time";
import { itemPath } from "@/fsd/shared/routes/project";
import { Chip } from "@/fsd/shared/ui/chip";
import { historyHref } from "../model/history-navigation";
import type { ProjectHistoryProps } from "../model/history-view";

export function HistoryItemsList({ slug, items, before, expanded, repo }: Extract<ProjectHistoryProps, { mode: "items" }>) {
  if (items.length === 0) return (
    <p className="rounded-lg border border-rule bg-paper px-3.5 py-6 text-sm text-quiet">No item history yet.</p>
  );
  return (
    <ol className="rounded-lg border border-rule bg-paper">
      {items.map(item => {
        const open = expanded?.key === item.key;
        const anchor = `history-item-${item.key}`;
        return (
          <li key={item.id} id={anchor} className="scroll-mt-4 border-b border-rule last:border-b-0">
            <Link href={`${historyHref(slug, { before, item: open ? undefined : item.key })}#${anchor}`}
              scroll={false} prefetch={false} aria-expanded={open} aria-controls={open ? `${anchor}-events` : undefined}
              className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 gap-y-1 px-3.5 py-3 hover:bg-field">
              <span className="min-w-0 text-sm">
                <span className="mr-2.5 font-mono text-xs">{item.key}</span>
                <span className="break-words">{item.title}</span>
              </span>
              <span className="flex items-center gap-2">
                <Chip tone="done">{item.discardedAt ? "Discarded" : statusLabel(item.status)}</Chip>
                <span aria-hidden="true" className="text-xs text-quiet">{open ? "▾" : "▸"}</span>
              </span>
              <time dateTime={item.at.toISOString()} className="col-span-2 font-mono text-xs text-quiet">
                Last activity · {utcMinute(item.at)}
              </time>
            </Link>
            {open ? (
              <div id={`${anchor}-events`} className="border-t border-rule bg-field/40 px-3.5 py-3">
                <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2 text-xs text-quiet">
                  <p>Includes past and discarded rounds.</p>
                  {expanded.currentRounds.has(item.key) ? (
                    <Link href={itemPath(slug, item.key)} className="text-ink underline underline-offset-2">View current item</Link>
                  ) : null}
                </div>
                <HistoryList rows={toHistoryRows(expanded.events, expanded.reports, { repo, order: "desc" })} />
                {expanded.events.length === 0 && expanded.reports.length === 0 ? <p className="text-sm text-quiet">No events on this page.</p> : null}
                {expanded.hasBefore || expanded.nextCursor ? (
                  <nav aria-label={`${item.key} history pages`} className="mt-3 flex justify-between gap-4 text-sm">
                    {expanded.hasBefore ? <Link scroll={false} href={`${historyHref(slug, { before, item: item.key })}#${anchor}`}
                      className="underline underline-offset-2">← Newest events</Link> : null}
                    {expanded.nextCursor ? <Link scroll={false} href={`${historyHref(slug, { before, item: item.key, itemBefore: expanded.nextCursor })}#${anchor}`}
                      className="ml-auto underline underline-offset-2">Older events →</Link> : null}
                  </nav>
                ) : null}
              </div>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

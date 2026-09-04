import { statusLabel } from "@/fsd/entities/board-item";
import { Chip } from "@/fsd/shared/ui/chip";
import { SectionLabel } from "@/fsd/shared/ui/section-label";

export type TimelineEvent = {
  at: Date;
  actor: string;
  from: string | null;
  to: string | null;
  note: string | null;
};

export type ItemDoc = { label: string; path: string; href: string };

export type BoardItemView = {
  key: string;
  title: string;
  area: string;
  agent: string;
  status: string;
  reason: string;
  results: string[];
  validation: string | null;
  proposedOn: Date;
  docs: ItemDoc[];
  events: TimelineEvent[];
  // 창 밖으로 밀린 이력이 있을 때만 true — 창이 없는 플랜에서는 언제나 false다.
  historyTruncated?: boolean;
};

const stamp = (d: Date) => d.toISOString().slice(0, 16).replace("T", " ");

export function BoardItemPage({ item }: { item: BoardItemView }) {
  return (
    <>
      <header className="flex flex-col gap-1">
        <p className="font-mono text-xs text-quiet">
          {item.key} · {item.agent} · {item.area}
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">{item.title}</h1>
        <p className="flex flex-wrap items-center gap-2 text-sm">
          <Chip tone="done">{statusLabel(item.status)}</Chip>
          <span className="font-mono text-xs text-quiet">Proposed {stamp(item.proposedOn)}</span>
        </p>
      </header>

      <dl className="flex flex-col gap-4 text-sm">
        <div>
          <dt className="mb-1 text-[11px] font-medium uppercase tracking-[0.06em] text-quiet">Evidence</dt>
          <dd className="whitespace-pre-wrap">{item.reason}</dd>
        </div>
        <div>
          <dt className="mb-1 text-[11px] font-medium uppercase tracking-[0.06em] text-quiet">Result</dt>
          <dd>
            {item.results.length === 0 ? (
              <span className="text-quiet">None yet</span>
            ) : (
              <ol className="list-decimal space-y-1 pl-5">
                {item.results.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ol>
            )}
          </dd>
        </div>
        <div>
          <dt className="mb-1 text-[11px] font-medium uppercase tracking-[0.06em] text-quiet">Validation</dt>
          <dd>
            {item.validation ?? (
              <Chip tone="risk" title="No independent validation has been recorded.">
                No validation yet
              </Chip>
            )}
          </dd>
        </div>
      </dl>

      {item.docs.length > 0 ? (
        <section>
          <SectionLabel>Documents</SectionLabel>
          <ul className="flex flex-col gap-1 text-sm">
            {item.docs.map((doc) => (
              <li key={doc.href} className="flex flex-wrap items-baseline gap-2">
                <a href={doc.href} target="_blank" rel="noreferrer" className="underline underline-offset-2">
                  {doc.label} ↗
                </a>
                <span className="font-mono text-xs text-quiet">{doc.path}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section>
        <SectionLabel>History</SectionLabel>
        <ol className="rounded-lg border border-rule bg-paper">
          {item.events.map((e, i) => (
            <li key={i} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-rule px-3.5 py-2 text-sm last:border-b-0">
              <span className="font-mono text-xs text-quiet">{stamp(e.at)}</span>
              <span className="font-mono text-xs text-quiet">{e.actor}</span>
              <span className="font-mono text-xs">
                {e.from ?? "—"} → {e.to ?? "discarded"}
              </span>
              {e.note ? <span className="text-xs text-quiet">({e.note})</span> : null}
            </li>
          ))}
        </ol>
        {item.historyTruncated ? (
          <p className="mt-2 text-xs text-quiet">History older than 30 days opens on Pro.</p>
        ) : null}
      </section>
    </>
  );
}

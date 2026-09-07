import { statusLabel } from "@/fsd/entities/board-item";
import { ReopenActions, type TransitionAction } from "@/fsd/features/review-gate";
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
  acceptedAt: Date | null; // 인수 기록(main-loop의 report_submit in done). null이면 배너가 "needs acceptance"라 한다
  updatedAt: string; // ISO. 되돌리기(reopen)의 낙관적 잠금 토큰
  docs: ItemDoc[];
  events: TimelineEvent[];
  // 창 밖으로 밀린 이력이 있을 때만 true — 창이 없는 플랜에서는 언제나 false다.
  historyTruncated?: boolean;
};

const stamp = (d: Date) => d.toISOString().slice(0, 16).replace("T", " ");

// transition은 라우트가 slug를 bind해서 넘긴 사람 전이 액션(review-gate). 이 페이지는 되돌리기(reopen)에만 쓴다.
export function BoardItemPage({ item, transition }: { item: BoardItemView; transition: TransitionAction }) {
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
          {item.acceptedAt !== null ? <span className="font-mono text-xs text-quiet">Accepted {stamp(item.acceptedAt)}</span> : null}
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

      {/* done에서만 그려진다(reopenTargetsFor) — Documents를 읽고 결정하는 순서라 그 아래, History 위(product-copy.md §11). */}
      <ReopenActions itemKey={item.key} status={item.status} updatedAt={item.updatedAt} transition={transition} />

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

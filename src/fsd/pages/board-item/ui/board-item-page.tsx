import { blobHref, DOC_LINK_NOTE, NotVerifiedChip, statusLabel, type RepoRef } from "@/fsd/entities/board-item";
import { AcceptanceFailure, ReopenActions, type RetryAcceptanceAction, type TransitionAction } from "@/fsd/features/review-gate";
import { HistoryList, toHistoryRows, HISTORY_TRUNCATED_NOTE, type HistoryEventInput, type HistoryReportInput } from "@/fsd/widgets/history-feed";
import { utcMinute } from "@/fsd/shared/lib/relative-time";
import { Chip } from "@/fsd/shared/ui/chip";
import { SectionLabel } from "@/fsd/shared/ui/section-label";

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
  acceptedAt: Date | null; // 인수 기록(main-loop의 report_submit in done). 실패는 별도로 기록한다
  acceptanceFailure: { id: string; checks: number[]; note: string; path: string | null; commit: string | null; at: Date } | null;
  updatedAt: string; // ISO. 되돌리기(reopen)의 낙관적 잠금 토큰
  docs: ItemDoc[];
  events: HistoryEventInput[];
  reports: HistoryReportInput[];
  repo: RepoRef;
  // 창 밖으로 밀린 이력이 있을 때만 true — 창이 없는 플랜에서는 언제나 false다.
  historyTruncated?: boolean;
};

// transition은 라우트가 slug를 bind해서 넘긴 사람 전이 액션(review-gate). 이 페이지는 되돌리기(reopen)에만 쓴다.
export function BoardItemPage({ slug, item, transition, retryAcceptance, canWrite }: { slug: string; item: BoardItemView; transition: TransitionAction; retryAcceptance: RetryAcceptanceAction; canWrite: boolean }) {
  return (
    <>
      <header className="flex flex-col gap-1">
        <p className="font-mono text-xs text-quiet">
          {item.key} · {item.agent} · {item.area}
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">{item.title}</h1>
        <p className="flex flex-wrap items-center gap-2 text-sm">
          <Chip tone="done">{statusLabel(item.status)}</Chip>
          <span className="font-mono text-xs text-quiet">Proposed {utcMinute(item.proposedOn)}</span>
          {item.acceptedAt !== null ? <span className="font-mono text-xs text-quiet">Accepted {utcMinute(item.acceptedAt)}</span> : null}
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
            {item.validation ?? <NotVerifiedChip />}
          </dd>
        </div>
      </dl>
      {item.status === "done" ? <p className="text-xs text-quiet">The implementation span is complete. Acceptance is recorded separately after the five checks.</p> : null}

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
          {/* 링크 셋은 전부 기록된 커밋을 가리킨다 — 푸시 전이면 넷 다 404다(인박스 카드와 같은 문장). */}
          <p className="mt-1.5 text-xs text-quiet">{DOC_LINK_NOTE}</p>
        </section>
      ) : null}

      <AcceptanceFailure
        key={JSON.stringify([slug, item.key])}
        itemKey={item.key}
        updatedAt={item.updatedAt}
        canWrite={canWrite}
        retryAcceptance={retryAcceptance}
        failure={item.acceptanceFailure === null ? null : {
          ...item.acceptanceFailure, at: utcMinute(item.acceptanceFailure.at),
          href: item.acceptanceFailure.path !== null && item.acceptanceFailure.commit !== null
            ? blobHref(item.repo, item.acceptanceFailure.path, item.acceptanceFailure.commit) : null,
        }}
      />

      {/* done에서만 그려진다(reopenTargetsFor) — Documents를 읽고 결정하는 순서라 그 아래, History 위(product-copy.md §11). */}
      {canWrite ? <ReopenActions itemKey={item.key} status={item.status} updatedAt={item.updatedAt} transition={transition} /> : null}

      <section>
        <SectionLabel>History</SectionLabel>
        <HistoryList rows={toHistoryRows(item.events, item.reports, { repo: item.repo, order: "asc" })} showReportNote={false} />
        {item.historyTruncated ? (
          <p className="mt-2 text-xs text-quiet">{HISTORY_TRUNCATED_NOTE}</p>
        ) : null}
      </section>
    </>
  );
}

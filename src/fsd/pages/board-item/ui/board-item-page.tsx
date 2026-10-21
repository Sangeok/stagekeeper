import { blobHref, DOC_LINK_NOTE, NotVerifiedChip, statusLabel, type RepoRef } from "@/fsd/entities/board-item";
import { ChangePipelineControl, type ChangePipelineAction } from "@/fsd/features/change-item-pipeline";
import { AcceptanceFailure, ReopenActions, type RetryAcceptanceAction, type TransitionAction } from "@/fsd/features/review-gate";
import { HistoryList, toHistoryRows, HISTORY_TRUNCATED_NOTE, type HistoryEventInput, type HistoryReportInput } from "@/fsd/widgets/history-feed";
import { utcMinute } from "@/fsd/shared/lib/relative-time";
import { Chip } from "@/fsd/shared/ui/chip";
import { SectionLabel } from "@/fsd/shared/ui/section-label";

export type ItemDoc = { id: string; label: string; path: string; href: string };

export type BoardItemView = {
  id: string;
  pipeline: { pipelineId: string | null; name: string; canChange: boolean };
  key: string;
  title: string;
  area: string;
  agent: string;
  status: string;
  reason: string;
  results: string[];
  validation: string | null;
  proposedOn: Date;
  acceptedAt: Date | null;
  acceptanceFailure: { id: string; checks: number[]; note: string; path: string | null; commit: string | null; at: Date } | null;
  updatedAt: string;
  docs: ItemDoc[];
  events: HistoryEventInput[];
  reports: HistoryReportInput[];
  repo: RepoRef;
  historyTruncated?: boolean;
};

export function BoardItemPage({ slug, item, transition, retryAcceptance, canWrite, pipelineChoices, changePipeline }: { slug: string; item: BoardItemView; transition: TransitionAction; retryAcceptance: RetryAcceptanceAction; canWrite: boolean; pipelineChoices: { id: string; name: string }[]; changePipeline: ChangePipelineAction }) {
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

      <p className="text-sm text-quiet">Pipeline · {item.pipeline.name}</p>
      {canWrite && item.pipeline.canChange && pipelineChoices.length > 0 ? <ChangePipelineControl
        key={JSON.stringify([item.id, item.pipeline.pipelineId, item.updatedAt])} itemKey={item.key} updatedAt={item.updatedAt}
        pipelines={pipelineChoices} change={changePipeline} /> : null}

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
              <li key={doc.id} className="flex flex-wrap items-baseline gap-2">
                <a href={doc.href} target="_blank" rel="noreferrer" className="underline underline-offset-2">
                  {doc.label} ↗
                </a>
                <span className="font-mono text-xs text-quiet">{doc.path}</span>
              </li>
            ))}
          </ul>
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

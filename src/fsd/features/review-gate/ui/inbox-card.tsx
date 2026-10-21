import type { ReactElement, ReactNode } from "react";

import { DOC_LINK_NOTE, NotVerifiedChip, OverBudgetChip, isOverBudget, isPlanVerified, statusLabel } from "@/fsd/entities/board-item";
import { agoLabel, shortDate } from "@/fsd/shared/lib/relative-time";
import { ExternalButtonLink } from "@/fsd/shared/ui/button";
import { cardClass } from "@/fsd/shared/ui/card";
import { Chip } from "@/fsd/shared/ui/chip";
import { Code } from "@/fsd/shared/ui/code";
import { gateLabel } from "@/fsd/entities/pipeline";
import {
  gateNextActionHint,
  holdNoteLabel,
  resumeHint,
  resumePrimaryFor,
} from "../model/gate-text";
import { gateCardKey, slotGateEntry, type DiscardAction, type GateAction, type InboxItem, type InboxReadOnlyLabel, type TransitionAction } from "../model/inbox-item";
import { GateCardLock } from "./gate-card-lock";
import { InboxCardBoundary } from "./inbox-card-boundary";
import { InboxApproveControl, InboxRejectControl } from "./inbox-card-controls";
import { ResumeButtons } from "./resume-buttons";

type Props = { item: InboxItem; now: string; transition: TransitionAction; approve: GateAction; discard: DiscardAction; canWrite: boolean; readOnlyLabel?: InboxReadOnlyLabel };

export function InboxCard(props: Props): ReactElement {
  return <InboxCardBoundary itemKey={props.item.key}>
    <GateCardLock key={gateCardKey(props.item)}>
      <InboxCardContent {...props} />
    </GateCardLock>
  </InboxCardBoundary>;
}

function InboxCardContent({ item, now, transition, approve, discard, canWrite, readOnlyLabel = "Not selected" }: Props): ReactElement {
  const gate = item.gate;
  const isProposed = item.status === "proposed";
  const isInReview = item.status === "in_review";
  const isOnHold = item.status === "on_hold";
  const overBudget = isOverBudget([item.reason, ...item.results]);

  return (
        <article className={cardClass({ decision: gate !== null })}>
        <header className="flex flex-col gap-[3px]">
          <p className="font-mono text-xs text-quiet">
            {item.key} · {item.area || "—"} {item.type ? <Chip tone="done">{item.type}</Chip> : null}
          </p>
          <h3 className="text-[17px] leading-6 font-medium tracking-[-0.01em]">{item.title}</h3>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-quiet">
            <StatusLine item={item} now={now} />
            {overBudget ? <OverBudgetChip /> : null}
          </p>
        </header>

        {isInReview ? <PlanRow item={item} /> : null}
        {isProposed ? <Kv label="Evidence">{item.reason}</Kv> : null}
        {isOnHold ? <Kv label={holdNoteLabel(item.heldBy, item.agent)}>{item.results[item.results.length - 1] ?? item.reason}</Kv> : null}

        <div className="flex flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            {isInReview && item.planUrl !== null ? (
              <ExternalButtonLink href={item.planUrl}>Read the plan ↗</ExternalButtonLink>
            ) : null}
            {!canWrite ? (
              <span className="rounded-full border border-rule px-3 py-1 text-xs text-quiet">{readOnlyLabel}</span>
            ) : null}
            {gate !== null && canWrite ? (
              <InboxApproveControl input={{ key: item.key, gate, gateEntry: slotGateEntry(item) ?? undefined, expectedUpdatedAt: item.updatedAt }} approve={approve} />
            ) : null}
            {isOnHold && canWrite ? <ResumeButtons item={{ key: item.key, status: item.status, heldFrom: item.heldFrom, updatedAt: item.updatedAt }} transition={transition} /> : null}
          </div>
          {gate !== null && canWrite ? <p className="text-xs text-quiet">{gateNextActionHint(gate)}</p> : null}
          {isOnHold && canWrite ? (
            <p className="text-xs text-quiet">{resumeHint(resumePrimaryFor(item.heldFrom), item.heldFrom)}</p>
          ) : null}
        </div>

        {isInReview ? (
          <details className="text-xs text-quiet">
            <summary className="cursor-pointer">Evidence and result</summary>
            <div className="mt-2">
              <Kv label="Evidence">{item.reason}</Kv>
              {item.results.length > 0 ? <Kv label="Result">{item.results.join(" ")}</Kv> : null}
            </div>
          </details>
        ) : null}

        {canWrite ? <InboxRejectControl item={{ key: item.key, status: item.status, updatedAt: item.updatedAt }} transition={transition} discard={discard} /> : null}

        {canWrite ? <details className="text-xs text-quiet">
          <summary className="cursor-pointer">What this decision does</summary>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>
              <b className="font-medium text-ink">Request plan</b>: dev writes a plan.{" "}
              <b className="font-medium text-ink">Approve implementation</b>: dev changes the code. Neither starts dev —
              your coding client session does.
            </li>
            <li>
              <b className="font-medium text-ink">Verified</b> means an independent pass found nothing to change. Without one,
              the card shows <b className="font-medium text-ink">Not verified</b>.
            </li>
            <li>
              <b className="font-medium text-ink">Approve implementation</b> approves the plan at the commit shown on the card.
            </li>
            <li>
              <b className="font-medium text-ink">Read the plan</b> opens that commit on GitHub. If it 404s, the commit is
              still local — push the branch and reload.
            </li>
            <li>
              <b className="font-medium text-ink">Continue</b> moves the item to the next node; nothing changes on the board.
            </li>
            <li>Sending back clears the validation record.</li>
            <li>Discard can&apos;t be undone. At Proposed it also takes the item out of the backlog, so pm can&apos;t pick it again; at In review the item stays in the backlog.</li>
          </ul>
          <p className="mt-2">
            More in the repo: <Code>docs/architecture/protocol.md</Code>
          </p>
        </details> : null}
        </article>
  );
}

function StatusLine({ item, now }: { item: InboxItem; now: string }) {
  const today = new Date(now);
  const label = <b className="font-medium text-ink">{statusLabel(item.status)}</b>;
  if (item.status === "proposed") {
    return (
      <span>
        {label} · {item.proposedBy}, {agoLabel(new Date(item.proposedOn), today)}
      </span>
    );
  }
  if (item.status === "in_review") {
    return (
      <span>
        {label} · {item.agent} submitted a plan {agoLabel(new Date(item.statusSince), today)}
      </span>
    );
  }
  if (item.status === "on_hold") {
    return (
      <span>
        {label} · since {shortDate(new Date(item.statusSince))}
        {item.heldFrom !== null ? ` · was ${statusLabel(item.heldFrom)}` : ""}
      </span>
    );
  }
  if (item.gate !== null) {
    return (
      <span>
        {label} · waiting {gateLabel(item.gate)}
      </span>
    );
  }
  return <span>{label}</span>;
}

function PlanRow({ item }: { item: InboxItem }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-md bg-field px-3 py-2.5 text-xs">
      {isPlanVerified(item.status, item.validation) ? (
        <Chip tone="record" title={item.validation ?? undefined}>
          Verified
        </Chip>
      ) : (
        <NotVerifiedChip verifyIsNext={item.gate === "before-verify"} />
      )}
      {item.planPath !== null ? <span className="font-mono">{item.planPath}</span> : null}
      {item.planCommit !== null ? (
        <>
          <span className="text-edge">·</span>
          <span className="font-mono">{item.planCommit.slice(0, 7)}</span>
        </>
      ) : null}
      {item.planUrl !== null ? <span className="w-full text-quiet">{DOC_LINK_NOTE}</span> : null}
    </div>
  );
}

function Kv({ label, children }: { label: string; children: ReactNode }) {
  return (
    <dl className="grid grid-cols-[88px_minmax(0,1fr)] gap-x-3 gap-y-1 text-sm">
      <dt className="text-quiet">{label}</dt>
      <dd className="text-ink">{children}</dd>
    </dl>
  );
}

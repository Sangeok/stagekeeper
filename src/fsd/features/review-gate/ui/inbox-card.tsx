"use client";

import { useRouter } from "next/navigation";
import { useTransition, type ReactNode } from "react";
import { toast } from "sonner";

import { statusLabel } from "@/fsd/entities/board-item";
import { agoLabel, shortDate } from "@/fsd/shared/lib/relative-time";
import { Button, ExternalButtonLink } from "@/fsd/shared/ui/button";
import { cardClass } from "@/fsd/shared/ui/card";
import { Chip } from "@/fsd/shared/ui/chip";
import { Code } from "@/fsd/shared/ui/code";
import { gateTargetFor, rejectActionsFor, resumeTargetsFor } from "../model/gate-source";
import {
  UNVERIFIED_HINT,
  bounceResultLine,
  gateNextActionHint,
  holdResultLine,
  resumeHint,
  resumeLabel,
  resumePrimaryFor,
  resumeToast,
  type RejectAction,
} from "../model/gate-text";
import type { DiscardAction, InboxItem, TransitionAction } from "../model/inbox-item";
import { GateCardLock } from "./gate-card-lock";
import { GateTransitionButton } from "./gate-transition-button";
import { RejectActions } from "./reject-actions";

type Props = { item: InboxItem; now: string; transition: TransitionAction; discard: DiscardAction };

// 요약 예산. 서버가 새 값은 거부하지만, 이미 들어온 값의 초과 표시는 화면 몫이다.
const FIELD_BUDGET = 150;

// 카드 = 머리(키·영역 / 제목 / 상태 한 줄) → 읽을 것(계획서 줄 또는 증거) → 결정 블록(버튼 줄 + 결과 문장) → 보조.
export function InboxCard({ item, now, transition, discard }: Props) {
  const gateTo = gateTargetFor(item.status);
  const unverified = item.status === "in_review" && item.validation === null;
  const overBudget = item.reason.length > FIELD_BUDGET || item.results.some((r) => r.length > FIELD_BUDGET);

  const reject = (action: RejectAction, note: string) => {
    if (action === "discard") return discard(item.key, item.updatedAt);
    if (action === "hold") return transition(item.key, "on_hold", holdResultLine(new Date(now), note), item.updatedAt);
    return transition(item.key, "planning", bounceResultLine(note), item.updatedAt);
  };

  return (
    <GateCardLock>
      <article className={cardClass(gateTo !== null)}>
        <header className="flex flex-col gap-[3px]">
          <p className="font-mono text-xs text-quiet">
            {item.key} · {item.area}
          </p>
          <h3 className="text-[17px] leading-6 font-medium tracking-[-0.01em]">{item.title}</h3>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-quiet">
            <StatusLine item={item} now={now} />
            {overBudget ? (
              <Chip tone="done" title="This summary is over 150 characters. Move the details to docs/agents/.">
                Over 150 characters
              </Chip>
            ) : null}
          </p>
        </header>

        {item.status === "in_review" ? <PlanRow item={item} /> : null}
        {item.status === "proposed" ? <Kv label="Evidence">{item.reason}</Kv> : null}
        {item.status === "on_hold" ? <Kv label="Your note">{item.results[item.results.length - 1] ?? item.reason}</Kv> : null}

        <div className="flex flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            {item.status === "in_review" && item.planUrl !== null ? (
              <ExternalButtonLink href={item.planUrl}>Read the plan ↗</ExternalButtonLink>
            ) : null}
            {gateTo !== null ? (
              <GateTransitionButton
                to={gateTo}
                itemKey={item.key}
                variant={unverified ? "mine-outline" : "mine"}
                commit={() => transition(item.key, gateTo, undefined, item.updatedAt)}
              />
            ) : null}
            {item.status === "on_hold" ? <ResumeButtons item={item} transition={transition} /> : null}
          </div>
          {gateTo !== null ? (
            <p className={unverified ? "text-xs text-risk" : "text-xs text-quiet"}>
              {unverified ? UNVERIFIED_HINT : gateNextActionHint(gateTo)}
            </p>
          ) : null}
          {item.status === "on_hold" ? (
            <p className="text-xs text-quiet">{resumeHint(resumePrimaryFor(item.heldFrom), item.heldFrom)}</p>
          ) : null}
        </div>

        {item.status === "in_review" ? (
          <details className="text-xs text-quiet">
            <summary className="cursor-pointer">Evidence and result</summary>
            <div className="mt-2">
              <Kv label="Evidence">{item.reason}</Kv>
              {item.results.length > 0 ? <Kv label="Result">{item.results.join(" ")}</Kv> : null}
            </div>
          </details>
        ) : null}

        <RejectActions id={item.key} actions={rejectActionsFor(item.status)} reject={reject} />

        <details className="text-xs text-quiet">
          <summary className="cursor-pointer">What this decision does</summary>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>
              <b className="font-medium text-ink">Request plan</b>: dev writes a plan.{" "}
              <b className="font-medium text-ink">Approve implementation</b>: dev changes the code.
            </li>
            <li>
              <b className="font-medium text-ink">Verified</b> means an independent pass found nothing to change. Without it,
              the plan is unverified.
            </li>
            <li>Sending back clears the validation record.</li>
            <li>Discard can&apos;t be undone.</li>
          </ul>
          <p className="mt-2">
            More in the repo: <Code>docs/architecture/protocol.md</Code>
          </p>
        </details>
      </article>
    </GateCardLock>
  );
}

// 상태 · 누가 · 언제. 떠 있던 상태 칩을 이 한 줄이 대신한다.
function StatusLine({ item, now }: { item: InboxItem; now: string }) {
  const today = new Date(now);
  const label = <b className="font-medium text-ink">{statusLabel(item.status)}</b>;
  if (item.status === "proposed") {
    return (
      <span>
        {label} · pm, {agoLabel(new Date(item.proposedOn), today)}
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
  return <span>{label}</span>;
}

// 게이트②에서 읽을 것은 계획서다: 검증 여부(부재가 위험) · 경로 · 커밋.
function PlanRow({ item }: { item: InboxItem }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-md bg-field px-3 py-2.5 text-xs">
      {item.validation !== null ? (
        <Chip tone="record" title={item.validation}>
          Verified
        </Chip>
      ) : (
        <Chip tone="risk" title="No independent validation has been recorded. Approving now means implementing an unverified plan.">
          No validation yet
        </Chip>
      )}
      {item.planPath !== null ? <span className="font-mono">{item.planPath}</span> : null}
      {item.planCommit !== null ? (
        <>
          <span className="text-edge">·</span>
          <span className="font-mono">{item.planCommit.slice(0, 7)}</span>
        </>
      ) : null}
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

// 보류 카드: 멈춘 자리로 돌아가는 버튼 하나가 주(主). 다른 쪽은 텍스트 링크.
function ResumeButtons({ item, transition }: { item: InboxItem; transition: TransitionAction }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const targets = resumeTargetsFor(item.status);
  const primary = resumePrimaryFor(item.heldFrom);
  const secondary = targets.find((to) => to !== primary);

  const resume = (to: string) => {
    startTransition(async () => {
      const result = await transition(item.key, to, undefined, item.updatedAt);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(resumeToast(to, item.key));
      router.refresh();
    });
  };

  if (!targets.includes(primary)) return null;
  return (
    <>
      <Button variant="mine-outline" disabled={isPending} onClick={() => resume(primary)}>
        {resumeLabel(primary)}
      </Button>
      {secondary !== undefined ? (
        <button
          type="button"
          disabled={isPending}
          onClick={() => resume(secondary)}
          className="text-sm text-ink underline underline-offset-2 disabled:opacity-50"
        >
          {resumeLabel(secondary)} instead
        </button>
      ) : null}
    </>
  );
}

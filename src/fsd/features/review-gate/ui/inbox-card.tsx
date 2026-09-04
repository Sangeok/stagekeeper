"use client";

import { useRouter } from "next/navigation";
import { useTransition, type ReactNode } from "react";
import { toast } from "sonner";

import { OverBudgetChip, isOverBudget, isPlanUnverified, isPlanVerified, statusLabel } from "@/fsd/entities/board-item";
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
import { InboxCardBoundary } from "./inbox-card-boundary";
import { GateTransitionButton } from "./gate-transition-button";
import { RejectActions } from "./reject-actions";

type Props = { item: InboxItem; now: string; transition: TransitionAction; discard: DiscardAction; locked?: boolean };

// 카드 = 머리(키·영역 / 제목 / 상태 한 줄) → 읽을 것(계획서 줄 또는 증거) → 결정 블록(버튼 줄 + 결과 문장) → 보조.
export function InboxCard({ item, now, transition, discard, locked = false }: Props) {
  // 잠긴 프로젝트에서는 아무 결정도 내릴 수 없다. 게이트·재개·반려·폐기를 모두 감추고 칩만 남긴다 —
  // 서버 액션도 requireProjectWrite로 거부하므로, 눌러 보고 알게 되는 대신 미리 안다.
  // **사유 문장은 여기 두지 않는다.** 레이아웃 배너가 화면 맨 위에서 이미 말하고 있어서,
  // 카드마다 반복하면 같은 문장이 장 수만큼 늘어난다.
  const gateTo = gateTargetFor(item.status);
  const isProposed = item.status === "proposed";
  const isInReview = item.status === "in_review";
  const isOnHold = item.status === "on_hold";
  const isUnverified = isPlanUnverified(item.status, item.validation);
  // 서버가 새 값은 거부하지만(TEXT_LIMIT), 이미 들어온 값의 초과 표시는 화면 몫이다.
  // 재는 기준은 보드와 같은 한 곳(entities/board-item)에서 온다 — 두 화면이 어긋나지 않게.
  const overBudget = isOverBudget([item.reason, ...item.results]);

  const reject = (action: RejectAction, note: string) => {
    if (action === "discard") return discard(item.key, item.updatedAt);
    // 기록에 남는 날짜라 렌더 시각(now)이 아니라 누른 시각을 쓴다 — 탭을 오래 열어두면 어제 날짜가 박힌다.
    if (action === "hold") {
      return transition({ key: item.key, to: "on_hold", result: holdResultLine(new Date(), note), expectedUpdatedAt: item.updatedAt });
    }
    return transition({ key: item.key, to: "planning", result: bounceResultLine(note), expectedUpdatedAt: item.updatedAt });
  };

  return (
    <InboxCardBoundary itemKey={item.key}>
      <GateCardLock>
        <article className={cardClass(gateTo !== null)}>
        <header className="flex flex-col gap-[3px]">
          <p className="font-mono text-xs text-quiet">
            {item.key} · {item.area}
          </p>
          <h3 className="text-[17px] leading-6 font-medium tracking-[-0.01em]">{item.title}</h3>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-quiet">
            <StatusLine item={item} now={now} />
            {overBudget ? <OverBudgetChip /> : null}
          </p>
        </header>

        {isInReview ? <PlanRow item={item} /> : null}
        {isProposed ? <Kv label="Evidence">{item.reason}</Kv> : null}
        {isOnHold ? <Kv label="Your note">{item.results[item.results.length - 1] ?? item.reason}</Kv> : null}

        <div className="flex flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            {isInReview && item.planUrl !== null ? (
              <ExternalButtonLink href={item.planUrl}>Read the plan ↗</ExternalButtonLink>
            ) : null}
            {locked ? (
              <span className="rounded-full border border-line px-3 py-1 text-xs text-quiet">Locked</span>
            ) : null}
            {gateTo !== null && !locked ? (
              <GateTransitionButton
                to={gateTo}
                itemKey={item.key}
                variant={isUnverified ? "mine-outline" : "mine"}
                commit={() => transition({ key: item.key, to: gateTo, expectedUpdatedAt: item.updatedAt })}
              />
            ) : null}
            {isOnHold && !locked ? <ResumeButtons item={item} transition={transition} /> : null}
          </div>
          {gateTo !== null && !locked ? (
            <p className={isUnverified ? "text-xs text-risk" : "text-xs text-quiet"}>
              {isUnverified ? UNVERIFIED_HINT : gateNextActionHint(gateTo)}
            </p>
          ) : null}
          {isOnHold && !locked ? (
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

        {locked ? null : <RejectActions id={item.key} actions={rejectActionsFor(item.status)} reject={reject} />}

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
    </InboxCardBoundary>
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
      {/* 술어를 함수로 뺐으므로 여기서 validation이 non-null로 좁혀지지 않는다 — title 값만 보정한다. */}
      {isPlanVerified(item.status, item.validation) ? (
        <Chip tone="record" title={item.validation ?? undefined}>
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
// 서버 액션은 moveItem으로 받는다 — 바로 아래 React의 startTransition과 이름이 겹치지 않게.
function ResumeButtons({ item, transition: moveItem }: { item: InboxItem; transition: TransitionAction }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const targets = resumeTargetsFor(item.status);
  const primary = resumePrimaryFor(item.heldFrom);
  const secondary = targets.find((to) => to !== primary);

  const resume = (to: string) => {
    startTransition(async () => {
      const result = await moveItem({ key: item.key, to, expectedUpdatedAt: item.updatedAt });
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

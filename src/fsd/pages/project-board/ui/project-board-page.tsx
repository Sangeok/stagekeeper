"use client";
// 게이트·반려 버튼이 서버 액션을 감싼 콜백을 받으므로 이 트리는 Client Component다
// (함수 prop은 Server Component에서 직렬화되지 않는다). 서버 전용 모듈은 여기서 import하지 않는다.

import type { ReactNode } from "react";
import Link from "next/link";

import { statusLabel, type DocLink } from "@/fsd/entities/board-item";
import type { ReportDoc } from "@/fsd/entities/report";
import {
  GateCardLock,
  GateTransitionButton,
  RejectActions,
  gateTargetFor,
  holdResultLine,
  rejectActionsFor,
  type DiscardAction,
  type RejectAction,
  type TransitionAction,
} from "@/fsd/features/review-gate";
import { cn } from "@/fsd/shared/lib/class-name";
import { deriveJourney } from "../model/journey";
import type { Briefing, SpeechItem, Tone } from "../model/briefing";
import { AgentAvatar } from "./agent-avatar";
import { JourneyStepper } from "./journey-stepper";
import { OwnerBanner } from "./owner-banner";
import { PixelOffice } from "./pixel-office";

const TONE_TEXT: Record<Tone, string> = {
  pending: "text-amber-800",
  active: "text-sky-700",
  done: "text-zinc-400",
  hold: "text-amber-600",
  muted: "text-zinc-500",
};

export type BoardActions = {
  // 항목 id → BoardItem.updatedAt(ISO). ApcH의 sha 잠금 대응물 — 화면이 읽은 값을 그대로 돌려보낸다.
  updatedAt: Record<string, string>;
  transition: TransitionAction;
  discard: DiscardAction;
};

export function ProjectBoardPage({
  briefing,
  reports,
  actions,
}: {
  briefing: Briefing;
  reports: Map<string, ReportDoc[]>;
  actions: BoardActions;
}) {
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-8 px-4 py-8">
      <BriefingHeader briefing={briefing} />
      <InboxZone items={briefing.inbox} pendingCount={briefing.pendingCount} actions={actions} />
      <PixelOffice team={briefing.team} reports={reports} />
      <FeedZone items={briefing.feed} />
    </div>
  );
}

// 보드 필드가 150자 예산을 넘었을 때의 표식. CI가 없어 화면이 유일한 강제 장치다
// (보드 안내 블록의 기록 규칙 → 상세는 docs/agents/<행위자>/ 로).
function BudgetFlag() {
  return (
    <span
      title="This summary is over 150 characters. Move the details to docs/agents/."
      className="shrink-0 rounded border border-amber-600/50 px-1 text-[10px] leading-4 text-amber-600"
    >
      Over 150 characters
    </span>
  );
}

// 검증 표식. 기록이 있으면 조용한 칩(에이전트가 남긴 것), 없으면 위험 윤곽 — 위험은 부재에 있다.
// in_review 항목에서만 렌더한다(proposed는 계획이 없어 판정이 없다).
function ValidationMark({ validation }: { validation: string | null }) {
  if (validation !== null) {
    return (
      <span
        title={validation}
        className="shrink-0 rounded border border-zinc-300 bg-zinc-100 px-1 text-[10px] leading-4 text-zinc-600"
      >
        Verified
      </span>
    );
  }
  return (
    <span
      title="No independent validation has been recorded. Approving now means implementing an unverified plan."
      className="shrink-0 rounded border border-red-700 px-1 text-[10px] leading-4 text-red-700"
    >
      No validation yet
    </span>
  );
}

// 항목 카드에서 그 항목의 실재하는 문서(계획서·행위자 기록)로 가는 링크. 없으면 렌더 안 함.
function DocLinks({ docs }: { docs: DocLink[] }) {
  if (docs.length === 0) return null;
  return (
    <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
      {docs.map((d) => (
        <Link
          key={d.href}
          href={d.href}
          className={cn(
            "underline-offset-2 hover:underline",
            d.kind === "plan" ? "text-sky-700" : "text-zinc-500",
          )}
        >
          {d.label} →
        </Link>
      ))}
    </p>
  );
}

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <h2 className="font-mono text-sm tracking-widest text-zinc-500">
      {children}
    </h2>
  );
}

// Phase D에서 turn banner가 대신한다 — 그때까지는 문구만 영문.
function BriefingHeader({ briefing }: { briefing: Briefing }) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <p className="font-mono text-sm tracking-widest text-zinc-500">Board</p>
        <h1 className="font-mono text-3xl text-zinc-900">{briefing.today}</h1>
        <p className="mt-1 text-sm text-zinc-500">
          {briefing.pendingCount > 0
            ? `${briefing.pendingCount} ${briefing.pendingCount === 1 ? "item needs" : "items need"} your decision`
            : "Nothing needs your decision"}
        </p>
      </div>
    </header>
  );
}

function InboxZone({
  items,
  pendingCount,
  actions,
}: {
  items: SpeechItem[];
  pendingCount: number;
  actions: BoardActions;
}) {
  return (
    <section className="flex flex-col gap-3">
      <OwnerBanner pendingCount={pendingCount} />
      {items.length === 0 ? (
        <div className="rounded-2xl border border-zinc-200 bg-white p-6 text-center">
          <p className="font-mono text-base text-zinc-900">Nothing needs your approval.</p>
          <p className="mt-1 text-sm text-zinc-500">Team status and recent activity are below.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {items.map((item) => (
            <InboxCard key={item.key} item={item} actions={actions} />
          ))}
        </div>
      )}
    </section>
  );
}

function InboxCard({ item, actions }: { item: SpeechItem; actions: BoardActions }) {
  // 목적지 status. item.status는 string | null → null이면 버튼 없음.
  const gateTo = item.status === null ? null : gateTargetFor(item.status);
  const rejectActions =
    item.status === null ? [] : rejectActionsFor(item.status);
  const journey = deriveJourney(item.status, item.validation);
  const expectedUpdatedAt = actions.updatedAt[item.id] ?? "";
  const reject = (action: RejectAction) => {
    if (action === "discard") return actions.discard(item.id, expectedUpdatedAt);
    if (action === "hold") {
      return actions.transition(item.id, "on_hold", holdResultLine(new Date()), expectedUpdatedAt);
    }
    return actions.transition(item.id, "planning", undefined, expectedUpdatedAt);
  };
  return (
    <article className="rounded-2xl border border-amber-700/40 bg-amber-50 p-4">
      <div className="flex items-center gap-3">
        <AgentAvatar identity={item.speaker} size="md" />
        <p className="text-sm text-zinc-500">
          <span className="font-mono text-zinc-900">
            {item.speaker.handle}
          </span>{" "}
          · {item.speaker.role}
        </p>
      </div>
      <p className="mt-3 text-lg text-amber-800">{item.line}</p>
      {journey !== null && <JourneyStepper journey={journey} />}
      <GateCardLock>
        <div className="mt-3 flex items-start justify-between gap-2">
          <p className="flex flex-wrap items-center gap-1.5 text-xs text-zinc-500">
            <span className="font-mono">{item.id}</span> · {statusLabel(item.status)}
            {item.status === "in_review" && (
              <ValidationMark validation={item.validation} />
            )}
            {item.overBudget && <BudgetFlag />}
          </p>
          {gateTo !== null && (
            <GateTransitionButton
              to={gateTo}
              itemKey={item.id}
              commit={() => actions.transition(item.id, gateTo, undefined, expectedUpdatedAt)}
            />
          )}
        </div>
        {rejectActions.length > 0 && (
          <RejectActions id={item.id} actions={rejectActions} reject={reject} />
        )}
      </GateCardLock>
      <DocLinks docs={item.docs} />
      {item.detail && (
        <details className="mt-3 border-t border-amber-700/20 pt-2">
          <summary className="cursor-pointer text-xs text-zinc-500">Show evidence</summary>
          <p className="mt-2 text-sm whitespace-pre-wrap text-zinc-500">
            {item.detail}
          </p>
        </details>
      )}
    </article>
  );
}

function FeedZone({ items }: { items: SpeechItem[] }) {
  return (
    <section className="flex flex-col gap-1">
      <SectionLabel>Activity</SectionLabel>
      {items.length === 0 ? (
        <p className="text-sm text-zinc-500">No activity yet.</p>
      ) : (
        <div>
          {items.map((item) => (
            <details
              key={item.key}
              className="group border-b border-zinc-200 py-3"
            >
              <summary className="flex cursor-pointer list-none items-start gap-3">
                <AgentAvatar identity={item.speaker} size="sm" />
                <span
                  className={cn(
                    "flex-1 text-sm line-clamp-1 group-open:line-clamp-none",
                    TONE_TEXT[item.tone],
                  )}
                >
                  {item.line}
                </span>
                <span className="flex shrink-0 items-center gap-1.5 text-xs text-zinc-500">
                  {item.overBudget && <BudgetFlag />}
                  {statusLabel(item.status)}
                </span>
              </summary>
              {item.detail && (
                <p className="mt-2 pl-11 text-sm whitespace-pre-wrap text-zinc-500">
                  {item.detail}
                </p>
              )}
              <div className="pl-11">
                <DocLinks docs={item.docs} />
              </div>
            </details>
          ))}
        </div>
      )}
    </section>
  );
}

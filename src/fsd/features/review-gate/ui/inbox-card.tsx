"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";

import { statusLabel } from "@/fsd/entities/board-item";
import { gateTargetFor, rejectActionsFor, resumeTargetsFor } from "../model/gate-source";
import { holdResultLine, resumeLabel, resumeToast, type RejectAction } from "../model/gate-text";
import type { DiscardAction, InboxItem, TransitionAction } from "../model/inbox-item";
import { GateCardLock } from "./gate-card-lock";
import { GateTransitionButton } from "./gate-transition-button";
import { RejectActions } from "./reject-actions";

type Props = { item: InboxItem; transition: TransitionAction; discard: DiscardAction };

// 요약 예산. 서버가 새 값은 거부하지만, 이미 들어온 값의 초과 표시는 화면 몫이다.
const FIELD_BUDGET = 150;

export function InboxCard({ item, transition, discard }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const gateTo = gateTargetFor(item.status);
  const resumeTargets = resumeTargetsFor(item.status);
  const overBudget = item.reason.length > FIELD_BUDGET || item.results.some((r) => r.length > FIELD_BUDGET);

  const reject = (action: RejectAction) => {
    if (action === "discard") return discard(item.key, item.updatedAt);
    if (action === "hold") return transition(item.key, "on_hold", holdResultLine(new Date()), item.updatedAt);
    return transition(item.key, "planning", undefined, item.updatedAt);
  };

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

  return (
    <GateCardLock>
      <article className="space-y-3 rounded-md border border-zinc-200 p-4">
        <header className="flex items-start justify-between gap-3">
          <div>
            <p className="font-mono text-xs text-zinc-500">
              {item.key} · {item.agent}
            </p>
            <h3 className="font-medium">{item.title}</h3>
          </div>
          <span className="shrink-0 rounded-full bg-zinc-100 px-2 py-0.5 text-xs">{statusLabel(item.status)}</span>
        </header>

        <dl className="space-y-1 text-sm">
          <div className="flex gap-2">
            <dt className="shrink-0 text-zinc-500">Evidence</dt>
            <dd>{item.reason}</dd>
          </div>
          {item.results.length > 0 ? (
            <div className="flex gap-2">
              <dt className="shrink-0 text-zinc-500">Result</dt>
              <dd>{item.results.join(" ")}</dd>
            </div>
          ) : null}
          <div className="flex gap-2">
            <dt className="shrink-0 text-zinc-500">Validation</dt>
            <dd className="flex flex-wrap items-center gap-1.5">
              {item.validation ? (
                <span title={item.validation} className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs">
                  Verified
                </span>
              ) : (
                <span
                  title="No independent validation has been recorded. Approving now means implementing an unverified plan."
                  className="rounded-full border border-red-700 px-2 py-0.5 text-xs text-red-700"
                >
                  No validation yet
                </span>
              )}
              {overBudget ? (
                <span
                  title="This summary is over 150 characters. Move the details to docs/agents/."
                  className="rounded-full border border-zinc-300 px-2 py-0.5 text-xs text-zinc-500"
                >
                  Over 150 characters
                </span>
              ) : null}
            </dd>
          </div>
          {item.planUrl ? (
            <div className="flex gap-2">
              <dt className="shrink-0 text-zinc-500">Plan</dt>
              <dd>
                <a href={item.planUrl} className="font-mono text-xs underline" target="_blank" rel="noreferrer">
                  {item.planPath}
                </a>
              </dd>
            </div>
          ) : null}
        </dl>

        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            {resumeTargets.map((to) => (
              <button
                key={to}
                type="button"
                disabled={isPending}
                onClick={() => resume(to)}
                className="rounded-md border border-zinc-300 px-3 py-1 text-xs disabled:opacity-60"
              >
                {resumeLabel(to)}
              </button>
            ))}
          </div>
          {gateTo ? (
            <GateTransitionButton
              to={gateTo}
              itemKey={item.key}
              commit={() => transition(item.key, gateTo, undefined, item.updatedAt)}
            />
          ) : null}
        </div>

        <RejectActions id={item.key} actions={rejectActionsFor(item.status)} reject={reject} />

        <details className="text-xs text-zinc-600">
          <summary className="cursor-pointer text-zinc-500">What this decision does</summary>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>
              <strong>Request plan</strong>: dev writes a plan. <strong>Approve implementation</strong>: dev changes the code.
            </li>
            <li>
              <strong>Verified</strong> means an independent pass found nothing to change. Without it, the plan is unverified.
            </li>
            <li>Sending back clears the validation record.</li>
            <li>Discard can&apos;t be undone.</li>
          </ul>
          <p className="mt-2">
            More in the repo: <code className="font-mono">docs/architecture/protocol.md</code>
          </p>
        </details>
      </article>
    </GateCardLock>
  );
}

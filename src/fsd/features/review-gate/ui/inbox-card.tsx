"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";

import { gateTargetFor, rejectActionsFor, resumeTargetsFor } from "../model/gate-source";
import { holdResultLine, type RejectAction } from "../model/gate-text";
import type { DiscardAction, InboxItem, TransitionAction } from "../model/inbox-item";
import { GateCardLock } from "./gate-card-lock";
import { GateTransitionButton } from "./gate-transition-button";
import { RejectActions } from "./reject-actions";

type Props = { item: InboxItem; transition: TransitionAction; discard: DiscardAction };

export function InboxCard({ item, transition, discard }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const gateTo = gateTargetFor(item.status);
  const resumeTargets = resumeTargetsFor(item.status);

  const reject = (action: RejectAction) => {
    if (action === "discard") return discard(item.key, item.updatedAt);
    if (action === "hold") return transition(item.key, "보류", holdResultLine(new Date()), item.updatedAt);
    return transition(item.key, "계획지시", undefined, item.updatedAt);
  };

  const resume = (to: string) => {
    startTransition(async () => {
      const result = await transition(item.key, to, undefined, item.updatedAt);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(`${to}로 재개했습니다.`);
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
          <span className="shrink-0 rounded-full bg-zinc-100 px-2 py-0.5 text-xs">{item.status}</span>
        </header>

        <dl className="space-y-1 text-sm">
          <div className="flex gap-2">
            <dt className="shrink-0 text-zinc-500">증거</dt>
            <dd>{item.reason}</dd>
          </div>
          {item.results.length > 0 ? (
            <div className="flex gap-2">
              <dt className="shrink-0 text-zinc-500">결과</dt>
              <dd>{item.results.join(" ")}</dd>
            </div>
          ) : null}
          <div className="flex gap-2">
            <dt className="shrink-0 text-zinc-500">검증</dt>
            <dd>
              {item.validation ? (
                <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs text-emerald-800">{item.validation}</span>
              ) : (
                <span className="text-xs text-zinc-400">검증 전</span>
              )}
            </dd>
          </div>
          {item.planUrl ? (
            <div className="flex gap-2">
              <dt className="shrink-0 text-zinc-500">계획서</dt>
              <dd>
                <a href={item.planUrl} className="text-xs underline" target="_blank" rel="noreferrer">
                  {item.planPath}
                </a>
              </dd>
            </div>
          ) : null}
        </dl>

        <div className="flex items-center gap-3">
          {gateTo ? (
            <GateTransitionButton
              label={gateTo}
              commit={() => transition(item.key, gateTo, undefined, item.updatedAt)}
            />
          ) : null}
          {resumeTargets.map((to) => (
            <button
              key={to}
              type="button"
              disabled={isPending}
              onClick={() => resume(to)}
              className="rounded-md border border-zinc-300 px-3 py-1 text-xs disabled:opacity-60"
            >
              {to}로 재개
            </button>
          ))}
        </div>

        <RejectActions id={item.key} actions={rejectActionsFor(item.status)} reject={reject} />

        <details className="text-xs text-zinc-600">
          <summary className="cursor-pointer text-zinc-500">이 결정이 무엇을 지시하나</summary>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>
              <strong>계획지시</strong>: 담당 dev가 계획서를 씁니다. <strong>구현승인</strong>: 담당 dev가 코드를 고칩니다.
            </li>
            <li>
              <strong>검증</strong> 칩이 있으면 무편집 클린 패스가 나온 것이고, 없으면 「검증 전」입니다.
            </li>
            <li>되돌리기는 검증 기록을 지웁니다.</li>
            <li>폐기는 되돌릴 수 없습니다.</li>
          </ul>
          <p className="mt-2">
            더 알고 싶으면 저장소의 <code className="font-mono">docs/architecture/protocol.md</code>를 보세요.
          </p>
        </details>
      </article>
    </GateCardLock>
  );
}

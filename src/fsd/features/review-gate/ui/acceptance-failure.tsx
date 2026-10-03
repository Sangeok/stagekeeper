"use client";

import { useLayoutEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { DOC_LINK_NOTE } from "@/fsd/entities/board-item";
import { Button } from "@/fsd/shared/ui/button";
import { SectionLabel } from "@/fsd/shared/ui/section-label";
import { ACCEPTANCE_CHECK_LABELS, ACCEPTANCE_RETRY_HINT, ACCEPTANCE_RETRY_UNKNOWN } from "../model/gate-text";
import type { RetryAcceptanceAction } from "../model/inbox-item";

export type AcceptanceFailureView = {
  id: string; checks: number[]; note: string; path: string | null; href: string | null; at: string;
};
type Props = {
  itemKey: string; updatedAt: string; canWrite: boolean;
  failure: AcceptanceFailureView | null; retryAcceptance: RetryAcceptanceAction;
};

// The item wrapper survives its own A → null refresh. Observing B permanently invalidates A,
// even if B later disappears. Navigating to another item unmounts this wrapper (the page keys it).
export function AcceptanceFailure(props: Props) {
  const alive = useRef(false);
  const observed = useRef<string | null>(null);
  const generation = useRef(0);
  const failureId = props.failure?.id ?? null;
  useLayoutEffect(() => {
    alive.current = true;
    return () => { alive.current = false; generation.current += 1; };
  }, []);
  useLayoutEffect(() => {
    if (failureId !== null && failureId !== observed.current) {
      observed.current = failureId;
      generation.current += 1;
    }
  }, [failureId]);
  const responseGuard = () => {
    const submitted = generation.current;
    let consumed = false;
    return () => {
      if (consumed || !alive.current || submitted !== generation.current) return false;
      consumed = true;
      return true;
    };
  };
  return props.failure === null ? null : (
    <FailureRecord key={JSON.stringify([props.itemKey, props.failure.id])} {...props} failure={props.failure} responseGuard={responseGuard} />
  );
}

function FailureRecord({ itemKey, updatedAt, canWrite, failure, retryAcceptance, responseGuard }: Props & {
  failure: AcceptanceFailureView; responseGuard: () => () => boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [uncertain, setUncertain] = useState(false);
  const mounted = useRef(false);
  useLayoutEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  const retry = () => {
    const current = responseGuard();
    setUncertain(false);
    startTransition(async () => {
      try {
        const outcome = await retryAcceptance({ key: itemKey, expectedUpdatedAt: updatedAt });
        if (!current()) return;
        if (outcome.success) toast.success(`Acceptance ready to run again · ${itemKey}`);
        else toast.error(outcome.error);
        router.refresh();
      } catch {
        if (!current()) return;
        // A lost response can follow a committed write. Only a fresh detail can resolve it.
        if (mounted.current) setUncertain(true);
        toast(ACCEPTANCE_RETRY_UNKNOWN);
        router.refresh();
      }
    });
  };
  return (
    <section>
      <SectionLabel>Acceptance failed</SectionLabel>
      <p className="font-mono text-xs text-quiet">
        {failure.checks.map((check) => `${check} ${ACCEPTANCE_CHECK_LABELS[check]}`).join(" · ")} · {failure.at}
      </p>
      <p className="mt-2 whitespace-pre-wrap text-sm">{failure.note}</p>
      {failure.href !== null ? <div className="mt-2">
        <a href={failure.href} target="_blank" rel="noreferrer" className="text-sm underline underline-offset-2">Failure record ↗</a>
        <span className="ml-2 font-mono text-xs text-quiet">{failure.path}</span>
        <p className="mt-1.5 text-xs text-quiet">{DOC_LINK_NOTE}</p>
      </div> : null}
      {canWrite ? <div className="mt-3 flex flex-col gap-2">
        <div><Button variant="mine-outline" disabled={pending || uncertain} onClick={retry}>{pending ? "Preparing…" : "Run acceptance again"}</Button></div>
        <p className="text-xs text-quiet">{uncertain ? ACCEPTANCE_RETRY_UNKNOWN : ACCEPTANCE_RETRY_HINT}</p>
      </div> : null}
    </section>
  );
}

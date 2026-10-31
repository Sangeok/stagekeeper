"use client";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";

export type PipelineView = { kind: "catalog" } | { kind: "new" } | { kind: "pipeline"; id: string };
type Position = { session: string; index: number };

function viewFromQuery(value: string | null): PipelineView {
  return value === "new" ? { kind: "new" } : value ? { kind: "pipeline", id: value } : { kind: "catalog" };
}

function viewKey(view: PipelineView): string | null {
  return view.kind === "pipeline" ? view.id : view.kind === "new" ? "new" : null;
}

export function usePipelineNavigation({ canLeave, onLeave, unsaved }: { canLeave: () => boolean; onLeave: () => void; unsaved: boolean }) {
  const query = useSearchParams();
  const [view, setView] = useState(() => viewFromQuery(query?.get("pipeline") ?? null));
  const position = useRef<Position | null>(null);
  const restoring = useRef(false);

  useEffect(() => {
    const initial: Position = window.history.state?.pipelinePosition ?? { session: crypto.randomUUID(), index: 0 };
    position.current = initial;
    window.history.replaceState({ pipelinePosition: initial }, "");
  }, []);

  useEffect(() => {
    function onPopState(event: PopStateEvent): void {
      if (restoring.current) { restoring.current = false; return; }
      const next = event.state?.pipelinePosition as Position | undefined;
      const previous = position.current;
      if (!previous || next?.session !== previous.session) return;
      const destination = viewFromQuery(new URLSearchParams(window.location.search).get("pipeline"));
      if (viewKey(destination) === viewKey(view)) { position.current = next; return; }
      if (!canLeave()) {
        restoring.current = true;
        window.history.go(previous.index - next.index);
        return;
      }
      position.current = next;
      onLeave();
      setView(destination);
    }
    function onBeforeUnload(event: BeforeUnloadEvent): void {
      if (unsaved) { event.preventDefault(); event.returnValue = ""; }
    }
    window.addEventListener("popstate", onPopState);
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => { window.removeEventListener("popstate", onPopState); window.removeEventListener("beforeunload", onBeforeUnload); };
  }, [canLeave, onLeave, unsaved, view]);

  const requested = query?.get("pipeline") ?? null;
  const synchronizeUrl = useEffectEvent(() => {
    if (restoring.current || requested === viewKey(view)) return;
    if (!canLeave()) { update(view, "replace"); return; }
    onLeave();
    if (!window.history.state?.pipelinePosition && position.current) position.current = { ...position.current, index: position.current.index + 1 };
    update(viewFromQuery(requested), "replace");
  });
  useEffect(() => { synchronizeUrl(); }, [requested]);

  function update(next: PipelineView, mode: "push" | "replace"): void {
    const url = new URL(window.location.href);
    const value = viewKey(next);
    if (value === null) url.searchParams.delete("pipeline"); else url.searchParams.set("pipeline", value);
    const previous = position.current;
    const nextPosition = previous ? { ...previous, index: previous.index + (mode === "push" ? 1 : 0) } : null;
    position.current = nextPosition;
    window.history[mode === "push" ? "pushState" : "replaceState"]({ pipelinePosition: nextPosition }, "", url);
    setView(next);
  }

  function navigate(next: PipelineView): boolean {
    if (viewKey(next) === viewKey(view)) return true;
    if (!canLeave()) return false;
    onLeave();
    update(next, "push");
    return true;
  }

  return { view, navigate, replace: (next: PipelineView) => update(next, "replace") };
}

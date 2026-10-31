"use client";
import { useEffect, useId, useRef, type KeyboardEvent, type ReactNode } from "react";
import { Button } from "@/fsd/shared/ui/button";

export function PipelinePanel({ title, children, busy = false, onClose }: { title: string; children: ReactNode; busy?: boolean; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const element = dialog.current;
    const previous = document.activeElement;
    element?.showModal();
    return () => {
      element?.close();
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
    };
  }, []);
  function keepFocusInside(event: KeyboardEvent<HTMLDialogElement>): void {
    if (event.key !== "Tab") return;
    const controls = [...event.currentTarget.querySelectorAll<HTMLElement>('button:not([disabled]), select:not([disabled]), input:not([disabled]), a[href], [tabindex="0"]')].filter(element => element.getClientRects().length > 0);
    const first = controls[0], last = controls.at(-1);
    if (!first || !last) { event.preventDefault(); return; }
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }
  return <dialog ref={dialog} aria-labelledby={titleId} onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}
    onKeyDown={keepFocusInside}
    className="fixed inset-y-0 right-0 left-auto m-0 h-dvh max-h-dvh w-full max-w-xl overflow-y-auto border-l border-edge bg-paper p-6 text-ink backdrop:bg-black/30">
    <div className="mb-6 flex items-center justify-between gap-4"><h2 id={titleId} className="text-lg font-semibold">{title}</h2>
      <Button size="sm" variant="quiet" disabled={busy} onClick={onClose}>Close</Button></div>
    {children}
  </dialog>;
}

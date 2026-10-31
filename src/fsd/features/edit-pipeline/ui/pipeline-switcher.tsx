"use client";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { Button } from "@/fsd/shared/ui/button";
import type { PipelineCatalogEntry } from "../model/pipeline-catalog";
import { PipelineCatalog } from "./pipeline-catalog";

type Props = { entries: PipelineCatalogEntry[]; selectedId?: string; disabled: boolean; onSelect: (id: string) => boolean };

export function PipelineSwitcher({ entries, selectedId, disabled, onSelect }: Props) {
  const [open, setOpen] = useState(false);
  return <>
    <Button size="sm" variant="quiet" disabled={disabled} aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)}>Switch pipeline</Button>
    {open ? <SwitcherDialog entries={entries} selectedId={selectedId} disabled={disabled} onClose={() => setOpen(false)}
      onSelect={id => { if (onSelect(id)) setOpen(false); }} /> : null}
  </>;
}

function SwitcherDialog({ entries, selectedId, disabled, onSelect, onClose }: Omit<Props, "onSelect"> & { onSelect: (id: string) => void; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [query, setQuery] = useState("");
  useEffect(() => {
    const element = dialog.current;
    const previous = document.activeElement;
    element?.showModal();
    element?.querySelector("input")?.focus();
    return () => {
      element?.close();
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
    };
  }, []);
  function keepFocusInside(event: KeyboardEvent<HTMLDialogElement>): void {
    if (event.key !== "Tab") return;
    const controls = [...event.currentTarget.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled])')];
    const first = controls[0], last = controls.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  }
  return <dialog ref={dialog} aria-labelledby={titleId} onCancel={event => { event.preventDefault(); onClose(); }} onKeyDown={keepFocusInside}
    onClick={event => { if (event.target === event.currentTarget) { const box = event.currentTarget.getBoundingClientRect(); if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) onClose(); } }}
    className="fixed inset-0 m-auto max-h-[80dvh] w-[calc(100%_-_2rem)] max-w-xl overflow-y-auto rounded-xl border border-edge bg-paper p-5 text-ink shadow-lg backdrop:bg-black/30">
    <div className="mb-4 flex items-center justify-between gap-3"><h2 id={titleId} className="text-lg font-semibold">Switch pipeline</h2>
      <Button size="sm" variant="quiet" onClick={onClose}>Close</Button></div>
    <PipelineCatalog entries={entries} query={query} onQueryChange={setQuery} selectedId={selectedId} disabled={disabled} onSelect={onSelect} />
  </dialog>;
}

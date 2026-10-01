"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/fsd/shared/ui/button";
import { reconnectBlock, STALE_CONNECTION_MESSAGE, UNKNOWN_CONNECTION_MESSAGE, type ProjectConnectionAction, type ProjectConnectionModel } from "../model/project-connection-state";

type Props = { targetId: string; model: ProjectConnectionModel; disconnect: ProjectConnectionAction; reconnect: ProjectConnectionAction };

// 조각(fragment)으로 돌려준다 — 목록 행(flex-wrap)에서는 여는 버튼이 행 끝에, 확인 창(order-last w-full)이 행 아래에 놓이고,
// 배너(flex-col)에서는 위에서 아래로 쌓인다. 연결 해제는 드물고 hs_/ho_를 폐기하므로 ⋯ 메뉴 안에 둔다.
export function ProjectConnectionControl({ targetId, model, disconnect, reconnect }: Props) {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [refreshing, refresh] = useTransition();
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const itemRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!menuOpen) return;
    itemRef.current?.focus();
    const close = (event: PointerEvent) => { if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false); };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [menuOpen]);
  const target = model.projects.find((p) => p.id === targetId);
  if (!target) return null;
  const disconnected = target.disconnectedAt !== null;
  const label = disconnected ? "Reconnect repository" : "Disconnect repository";
  const busy = pending || refreshing;
  const blocked = disconnected ? reconnectBlock(model) : null;
  const reset = () => { setConfirming(false); setError(null); };
  const refreshState = () => refresh(() => router.refresh());
  const send = () => {
    setError(null);
    start(async () => {
      try {
        const result = await (disconnected ? reconnect : disconnect)({ targetProjectId: targetId, expectedVersion: model.version });
        if (result.status === "error") { setError(result.reason); return; }
        reset();
        if (result.status === "stale") { toast.error(STALE_CONNECTION_MESSAGE); refreshState(); }
        else toast.success(disconnected ? "Repository reconnected" : "Repository disconnected");
      } catch {
        reset();
        toast.error(UNKNOWN_CONNECTION_MESSAGE);
        refreshState();
      }
    });
  };
  const closeMenu = () => { setMenuOpen(false); triggerRef.current?.focus(); };
  const repository = <span className="font-mono">{target.repoOwner}/{target.repo}</span>;

  const trigger = disconnected ? (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <Button size="sm" variant="mine-outline" disabled={busy || blocked !== null} onClick={() => setConfirming(true)}>{label}</Button>
      {blocked ? <p className="text-xs text-quiet">{blocked}</p> : null}
    </div>
  ) : (
    <div ref={menuRef} className="relative" onKeyDown={(event) => { if (event.key === "Escape" && menuOpen) closeMenu(); }}>
      <button ref={triggerRef} type="button" aria-label={`More actions for ${target.name}`} aria-haspopup="menu" aria-expanded={menuOpen} disabled={busy}
        onClick={() => setMenuOpen(!menuOpen)}
        className="inline-flex size-[30px] items-center justify-center rounded-md border border-transparent text-base leading-none text-quiet hover:border-rule hover:bg-field hover:text-ink aria-expanded:border-rule aria-expanded:bg-field aria-expanded:text-ink disabled:opacity-50">⋯</button>
      {menuOpen ? <div role="menu" className="absolute top-full right-0 z-10 mt-1 flex min-w-56 flex-col rounded-lg border border-edge bg-paper p-1 text-sm">
        <button ref={itemRef} type="button" role="menuitem" disabled={!model.writesEnabled} onClick={() => { setMenuOpen(false); setConfirming(true); }}
          className="rounded px-2.5 py-2 text-left hover:bg-field disabled:cursor-default disabled:text-quiet disabled:hover:bg-transparent">Disconnect repository…</button>
        {!model.writesEnabled ? <p className="px-2.5 pb-2 text-xs text-quiet">Temporarily unavailable.</p> : null}
      </div> : null}
    </div>
  );

  // ⋯는 확인 창이 열려도 남긴다 — 사라지면 그 행의 열린 수가 옆 행들과 다른 자리로 밀린다.
  return <>
    {!confirming || !disconnected ? trigger : null}
    {!confirming ? null : (
      <section aria-label={label} className="order-last flex w-full flex-col gap-3 rounded-lg border border-rule bg-paper p-3 text-sm">
        {disconnected ? <>
          <p className="font-medium">{repository}</p>
          <p>{model.connectedCount} / {model.limit ?? "unlimited"} connected. Reconnect this project with its preserved data and settings. Your user token (hu_) still works; project tokens (hs_/ho_) must be issued again.</p>
        </> : <>
          <p className="font-medium">Disconnect {repository}?</p>
          <p>Project tokens (hs_/ho_) are revoked. Your data stays readable, and hu_ keeps working.</p>
        </>}
        <div className="flex gap-2">
          <Button size="sm" variant={disconnected ? "mine" : "risk"} disabled={busy || !model.writesEnabled} onClick={send}>{busy ? "Updating…" : label}</Button>
          <Button size="sm" disabled={busy} onClick={reset} autoFocus>Cancel</Button>
        </div>
        {!disconnected ? <p className="text-xs text-quiet">New requests stop. Approved ones may finish, and local Claude Code keeps running.</p> : null}
        {error ? <p role="alert" className="text-risk">{error}</p> : null}
      </section>
    )}
  </>;
}

"use client";
import Link from "next/link";
import { useEffect, useRef, useState, type ReactElement } from "react";
import type { ConnectionView, QueryState, RepositoryConnectionOperation } from "../model/github-connection-state";

type Props = { connection: ConnectionView; query: QueryState; operation: RepositoryConnectionOperation; message: string | null; canRetry: boolean;
  restoredDraftId?: string | null;
  authorize: () => void; manage: () => void; disconnect: (revision: number) => void; retry: () => void; loadMore: () => void; paste: () => void };

export function connectionStatusText({ operation, query, message }: Pick<Props, "operation" | "query" | "message">): string {
  if (operation === "opening") return "Opening repository connection…";
  if (operation === "disconnecting") return "Disconnecting repository list…";
  if (query.status === "loading") return "Loading repositories…";
  if (query.message) return query.message;
  if (message) return message;
  return query.status === "empty" ? "No repositories loaded. Check access on GitHub or paste a URL." : "";
}

export function RepositoryConnectionPanel({ connection, query, operation, message, canRetry, restoredDraftId, authorize, manage, disconnect, retry, loadMore, paste }: Props): ReactElement | null {
  const busy = operation !== "idle";
  const [consent, setConsent] = useState(false);
  const [disconnectRevision, setDisconnectRevision] = useState<number | null>(null);
  const status = useRef<HTMLParagraphElement>(null);
  useEffect(() => { if (restoredDraftId) status.current?.focus(); }, [restoredDraftId]);
  const actionClass = "text-xs underline underline-offset-2 disabled:opacity-50";
  if (!connection.available && connection.status === "not-connected" && !message) return null;
  return <section aria-label="Repository list connection" className="flex flex-col gap-2 rounded-lg border border-rule p-3">
    {connection.available && connection.status !== "connected" ? <>
      <button type="button" className={actionClass} disabled={busy} onClick={() => setConsent(true)}>
        {connection.status === "reauth-required" ? "Reconnect repository list" : "Connect private repositories"}
      </button>
      {consent ? <div className="flex flex-col gap-2 text-sm">
        <p>Read repository names, owners and default branches. No code access. Choose which repositories to allow on GitHub.</p>
        <p>You can paste a repository URL without connecting.</p>
        <div className="flex gap-3"><button type="button" className={actionClass} disabled={busy} onClick={authorize}>Continue to GitHub</button>
          <button type="button" className={actionClass} disabled={busy} onClick={() => setConsent(false)}>Cancel</button></div>
      </div> : null}
    </> : null}
    {connection.status !== "not-connected" ? <div className="flex flex-wrap gap-3">
      {connection.available && connection.status === "connected" ? <button type="button" className={actionClass} disabled={busy} onClick={manage}>Manage repository access</button> : null}
      <button type="button" className={actionClass} disabled={busy || connection.revision === null} onClick={() => setDisconnectRevision(connection.revision)}>Disconnect repository list</button>
    </div> : null}
    {disconnectRevision !== null ? <div className="text-sm"><p>Disconnect this repository list? Existing projects and their tokens will stay as they are.</p>
      <div className="flex gap-3"><button type="button" className={actionClass} disabled={busy} onClick={() => { disconnect(disconnectRevision); setDisconnectRevision(null); }}>Confirm list disconnect</button>
        <button type="button" className={actionClass} disabled={busy} onClick={() => setDisconnectRevision(null)}>Cancel disconnect</button></div></div> : null}
    <p ref={status} tabIndex={-1} role="status" aria-live="polite" className="text-xs text-quiet">{connectionStatusText({ operation, query, message })}</p>
    {!connection.available && connection.status === "not-connected" && message ? <Link href="/login" className={actionClass}>Sign in again</Link> : null}
    {query.unsupportedCount ? <p className="text-xs text-quiet">{query.unsupportedCount} archived or unsupported repositories were omitted.</p> : null}
    {connection.available && connection.status === "connected" ? <div className="flex flex-wrap gap-3">
      <button type="button" className={actionClass} disabled={busy || query.status === "loading" || !canRetry} onClick={retry}>Reload repository list</button>
      {query.nextCursor ? <button type="button" className={actionClass} disabled={busy || query.status === "loading" || !canRetry} onClick={loadMore}>Load more</button> : null}
      <button type="button" className={actionClass} onClick={paste}>Paste a repository URL</button>
    </div> : null}
  </section>;
}

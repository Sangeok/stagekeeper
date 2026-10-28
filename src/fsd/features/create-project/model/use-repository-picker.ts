"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { z } from "zod";
import { navigateToGitHub, repositoryPickerRequest } from "../api/repository-picker";
import { EMPTY_QUERY, repositoryPageSchema, restorableDraftSchema, type ConnectionView, type PickerInitialState, type QueryState, type RepositoryConnectionOperation, type SavedDraft } from "./github-connection-state";

const UNAVAILABLE = "The repository list is unavailable. You can still paste a repository URL.";
const startResponse = z.object({ redirectTo: z.string(), attemptId: z.uuid() });

type RepositoryPickerController = { connection: ConnectionView; query: QueryState; operation: RepositoryConnectionOperation; message: string | null; canRetry: boolean;
  restoredDraftId: string | null;
  start(action: "authorize" | "manage", draft: SavedDraft): Promise<void>; discardDraft(): Promise<void>; disconnect(revision: number): Promise<void>;
  reload(): Promise<void>; loadMore(): Promise<void> };

export function useRepositoryPicker(initial: PickerInitialState, restore: (draft: SavedDraft) => boolean, sessionLost: () => void, invalidateSelection: () => void): RepositoryPickerController {
  const [connection, setConnection] = useState(initial.connection);
  const [query, setQuery] = useState<QueryState>(EMPTY_QUERY);
  const [operation, setOperation] = useState<RepositoryConnectionOperation>("idle");
  const [message, setMessage] = useState<string | null>(initial.connection.notice);
  const [retryAt, setRetryAt] = useState(0);
  const retryDeadline = useRef(0);
  const [applied, setApplied] = useState<z.infer<typeof restorableDraftSchema> | null>(null);
  const generation = useRef(0);
  const flowGeneration = useRef(0);
  const activeRequest = useRef<AbortController | null>(null);
  const flowKey = `stagekeeper.github.flow.${initial.userKey}`;
  const cancelKey = `stagekeeper.github.cancel.${initial.userKey}`;
  const invalidateRequests = useCallback(() => { generation.current++; flowGeneration.current++; activeRequest.current?.abort(); }, []);
  const updateRetryDeadline = useCallback((deadline: number) => {
    retryDeadline.current = deadline;
    setRetryAt(deadline);
  }, []);

  const lostSession = useCallback(() => {
    invalidateRequests(); setApplied(null); setOperation("idle"); updateRetryDeadline(0);
    setQuery(EMPTY_QUERY);
    setConnection({ available: false, status: "not-connected", revision: null, notice: null });
    setMessage("Your session changed or expired. Sign in again to load repositories.");
    sessionLost();
  }, [sessionLost, invalidateRequests, updateRetryDeadline]);

  const load = useCallback(async (cursor: string | null = null) => {
    if (retryDeadline.current > Date.now()) return;
    if (retryDeadline.current) updateRetryDeadline(0);
    activeRequest.current?.abort();
    const controller = new AbortController();
    activeRequest.current = controller;
    const version = ++generation.current;
    setQuery(previous => ({ ...(cursor ? previous : EMPTY_QUERY), status: "loading" }));
    try {
      const result = await repositoryPickerRequest(initial.userKey, `repositories${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`, { signal: controller.signal });
      if (version !== generation.current || controller.signal.aborted) return;
      if (!result.ok) {
        setQuery({ ...EMPTY_QUERY, status: "error", message: result.message });
        if (result.code === "UNAUTHENTICATED") lostSession();
        if (result.code === "REAUTH_REQUIRED") {
          flowGeneration.current++;
          setConnection(previous => ({ ...previous, status: "reauth-required" }));
          invalidateSelection();
        }
        if (result.retryAfter) updateRetryDeadline(Date.now() + result.retryAfter * 1000);
        return;
      }
      const page = repositoryPageSchema.parse(result.value);
      setConnection(previous => ({ ...previous, status: "connected", revision: page.connectionRevision }));
      setQuery(previous => {
        const rows = new Map((cursor ? previous.repositories : []).filter(row => !page.failedInstallations.includes(row.installationId)).map(row => [row.repositoryId, row]));
        for (const row of page.repositories) rows.set(row.repositoryId, row);
        return { status: page.status === "partial" ? "partial" : rows.size ? "ready" : "empty", repositories: [...rows.values()], nextCursor: page.nextCursor,
          unsupportedCount: (cursor ? previous.unsupportedCount : 0) + page.unsupportedCount, message: page.failedInstallations.length ? "Some repository access couldn't be checked. Retry or paste a URL." : null };
      });
    } catch {
      if (version === generation.current && !controller.signal.aborted) setQuery({ ...EMPTY_QUERY, status: "error", message: UNAVAILABLE });
    }
  }, [initial.userKey, lostSession, invalidateSelection, updateRetryDeadline]);

  useEffect(() => () => { retryDeadline.current = 0; }, []);

  useEffect(() => {
    if (!initial.connection.available) return;
    let live = true;
    const controller = new AbortController();
    const version = flowGeneration.current;
    const isCurrent = () => live && !controller.signal.aborted && flowGeneration.current === version;
    async function resume() {
      try {
        const pendingCancel = sessionStorage.getItem(cancelKey);
        if (pendingCancel) {
          const result = await repositoryPickerRequest(initial.userKey, "connection/cancel", { body: { id: pendingCancel }, signal: controller.signal });
          if (!isCurrent()) return;
          if (!result.ok && result.code === "UNAUTHENTICATED") { lostSession(); return; }
          if (result.ok && sessionStorage.getItem(cancelKey) === pendingCancel) sessionStorage.removeItem(cancelKey);
        }
        const flowId = sessionStorage.getItem(flowKey);
        if (flowId) {
          const result = await repositoryPickerRequest(initial.userKey, `connection/draft?flowId=${encodeURIComponent(flowId)}`, { signal: controller.signal });
          if (!isCurrent()) return;
          if (!result.ok) { if (result.code === "UNAUTHENTICATED") lostSession(); return; }
          const parsed = z.object({ draft: restorableDraftSchema.nullable() }).safeParse(result.value);
          if (parsed.success && parsed.data.draft && sessionStorage.getItem(flowKey) === parsed.data.draft.flowId) {
            if (restore(parsed.data.draft.value)) {
              setApplied(parsed.data.draft);
              setMessage("Your draft was restored.");
            } else {
              sessionStorage.removeItem(flowKey);
              sessionStorage.setItem(cancelKey, flowId);
              const cancelled = await repositoryPickerRequest(initial.userKey, "connection/cancel", { body: { id: flowId }, signal: controller.signal });
              if (!isCurrent()) return;
              if (!cancelled.ok && cancelled.code === "UNAUTHENTICATED") { lostSession(); return; }
              if (cancelled.ok && sessionStorage.getItem(cancelKey) === flowId) sessionStorage.removeItem(cancelKey);
              setMessage("Your current inputs were kept.");
            }
          }
        }
      } catch { if (isCurrent()) setMessage("Your draft couldn't be restored. You can paste a repository URL."); }
    }
    void resume();
    if (initial.connection.status === "connected") {
      queueMicrotask(() => { if (isCurrent()) void load(); });
    }
    return () => { live = false; controller.abort(); invalidateRequests(); };
  }, [initial.connection.available, initial.connection.status, initial.userKey, flowKey, cancelKey, load, lostSession, restore, invalidateRequests]);

  useEffect(() => {
    if (!connection.available) return;
    let live = true;
    let controller: AbortController | null = null;
    const refresh = () => {
      if (document.visibilityState !== "visible") return;
      controller?.abort();
      if (connection.status === "connected" && retryDeadline.current <= Date.now()) { void load(); return; }
      const request = new AbortController();
      controller = request;
      const version = flowGeneration.current;
      void repositoryPickerRequest(initial.userKey, "connection/draft", { signal: request.signal }).then(result => {
        if (live && !request.signal.aborted && version === flowGeneration.current && !result.ok && result.code === "UNAUTHENTICATED") lostSession();
      }).catch(() => undefined);
    };
    window.addEventListener("focus", refresh);
    window.addEventListener("pageshow", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => { live = false; controller?.abort(); window.removeEventListener("focus", refresh); window.removeEventListener("pageshow", refresh); document.removeEventListener("visibilitychange", refresh); };
  }, [connection.available, connection.status, initial.userKey, load, lostSession]);

  useEffect(() => {
    if (!applied) return;
    const restored = applied;
    let live = true;
    async function acknowledge() {
      try {
        if (sessionStorage.getItem(flowKey) !== restored.flowId) return;
        const result = await repositoryPickerRequest(initial.userKey, "connection/draft", { body: { id: restored.id, generation: restored.generation } });
        if (live && result.ok && sessionStorage.getItem(flowKey) === restored.flowId) sessionStorage.removeItem(flowKey);
      } catch { if (live) setMessage("Your draft is here. Its restore confirmation couldn't be saved."); }
    }
    void acknowledge();
    return () => { live = false; };
  }, [applied, flowKey, initial.userKey]);

  useEffect(() => {
    if (!retryAt) return;
    const timer = setTimeout(() => {
      if (retryDeadline.current === retryAt) updateRetryDeadline(0);
    }, Math.max(0, retryAt - Date.now()));
    return () => clearTimeout(timer);
  }, [retryAt, updateRetryDeadline]);

  async function start(action: "authorize" | "manage", draft: SavedDraft): Promise<void> {
    activeRequest.current?.abort();
    const version = ++flowGeneration.current;
    generation.current++;
    setQuery(previous => previous.status === "loading" ? { ...previous, status: previous.repositories.length ? "ready" : "idle" } : previous);
    setOperation("opening"); setMessage(null);
    try {
      const result = await repositoryPickerRequest(initial.userKey, "connection/start", { body: { action, draft } });
      if (!result.ok) {
        if (version !== flowGeneration.current) return;
        setMessage(result.message);
        if (result.code === "UNAUTHENTICATED") lostSession();
        return;
      }
      const value = startResponse.parse(result.value);
      if (version !== flowGeneration.current) { await repositoryPickerRequest(initial.userKey, "connection/cancel", { body: { id: value.attemptId } }); return; }
      sessionStorage.setItem(flowKey, value.attemptId);
      navigateToGitHub(value.redirectTo);
    } catch { if (version === flowGeneration.current) setMessage("Couldn't start the connection. Try again or paste a repository URL."); }
    finally { if (version === flowGeneration.current) setOperation("idle"); }
  }

  async function discardDraft(): Promise<void> {
    generation.current++; flowGeneration.current++; activeRequest.current?.abort(); setOperation("idle"); setApplied(null);
    setQuery(previous => previous.status === "loading" ? { ...previous, status: previous.repositories.length ? "ready" : "idle" } : previous);
    try {
      const id = sessionStorage.getItem(flowKey) ?? sessionStorage.getItem(cancelKey);
      sessionStorage.removeItem(flowKey);
      if (!id) return;
      sessionStorage.setItem(cancelKey, id);
      const result = await repositoryPickerRequest(initial.userKey, "connection/cancel", { body: { id } });
      if (result.ok && sessionStorage.getItem(cancelKey) === id) sessionStorage.removeItem(cancelKey);
      if (!result.ok) setMessage("The form was cleared. Retry Start over to confirm draft deletion.");
    } catch { setMessage("The form was cleared. Retry Start over to confirm draft deletion."); }
  }

  async function disconnect(revision: number): Promise<void> {
    const version = ++flowGeneration.current;
    generation.current++;
    activeRequest.current?.abort(); setOperation("disconnecting");
    try {
      const result = await repositoryPickerRequest(initial.userKey, "connection/disconnect", { body: { revision } });
      if (version !== flowGeneration.current) return;
      generation.current++; activeRequest.current?.abort();
      setQuery(EMPTY_QUERY);
      if (!result.ok) { setMessage(result.message); if (result.code === "UNAUTHENTICATED") lostSession(); return; }
      const value = z.object({ stopped: z.literal(true), providerRevoked: z.boolean() }).parse(result.value);
      setConnection(previous => ({ ...previous, status: "not-connected", revision: null }));
      invalidateSelection();
      setMessage(value.providerRevoked ? "Repository list disconnected. Existing projects are unchanged." : "Repository list stopped here. Revoke this app's authorization in GitHub settings to confirm external revocation.");
    } catch { if (version === flowGeneration.current) { setQuery(EMPTY_QUERY); setMessage("Couldn't confirm the disconnect. Reload before trying again."); } }
    finally { if (version === flowGeneration.current) setOperation("idle"); }
  }

  return { connection, query, operation, message, restoredDraftId: applied?.id ?? null, canRetry: retryAt === 0, start, discardDraft, disconnect, reload: () => load(), loadMore: () => load(query.nextCursor) };
}

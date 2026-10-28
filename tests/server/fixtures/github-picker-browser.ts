import type { ComponentProps } from "react";
import type { NewProjectForm } from "@/fsd/features/create-project";

type PickerState = NonNullable<ComponentProps<typeof NewProjectForm>["picker"]>;
type InitialEndpoint = "cancel" | "draft" | "list";
type InitialOutcome = "success" | "unauthenticated" | "reauth-required" | "unavailable" | "invalid" | "invalid-value" | "network" | "empty" | "partial";
type PickerRequest = { id: number; method: string; path: string; search: string; body: unknown; aborted: boolean; settled: boolean };

export const githubControls = {
  requests: [] as string[], releaseDraft: () => {}, releaseList: () => {}, expire: () => {}, failList: () => {}, changeBranch: () => {},
  limitList: () => {}, allowList: () => {}, expireCooldown: () => {}, elapseCooldown: () => {},
  limitProbe: () => {}, failProbe: () => {}, holdProbe: () => {}, releaseProbe: () => {}, releaseStart: () => {}, releaseDisconnect: () => {},
  pendingCount: () => 0, cooldownTimerCount: () => 0,
  requestRecords: [] as PickerRequest[],
  releaseInitial(endpoint: InitialEndpoint, outcome: InitialOutcome = "success"): void { void endpoint; void outcome; },
};

export function installGitHubPickerFixture(mode: string): { initial: PickerState; cleanup(): void } {
  const initialCase = mode.startsWith("private-initial-") ? mode.slice("private-initial-".length) : null;
  const original = window.fetch;
  const browserWindow: Window = window;
  const originalNow = Date.now, originalSetTimeout = browserWindow.setTimeout, originalClearTimeout = browserWindow.clearTimeout;
  const cooldownTimers = new Map<number, () => void>();
  let clock = Date.now(), timerId = -1;
  if (mode.startsWith("private-cooldown")) {
    Date.now = () => clock;
    browserWindow.setTimeout = (handler: TimerHandler, timeout?: number, ...args: unknown[]): number => {
      if (timeout === 30_000 && typeof handler === "function") {
        const id = timerId--;
        cooldownTimers.set(id, () => handler(...args));
        return id;
      }
      return originalSetTimeout(handler, timeout, ...args);
    };
    browserWindow.clearTimeout = (id?: number): void => { if (id === undefined || !cooldownTimers.delete(id)) originalClearTimeout(id); };
  }
  const visibility = Object.getOwnPropertyDescriptor(document, "visibilityState");
  if (new URLSearchParams(location.search).get("mode") !== "private-cooldown") Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
  let expired = false, failList = false, changedBranch = false, limited = false, heldProbe = false;
  let probeFailure: 429 | 503 | null = null;
  const pendingDraft = new Set<() => void>(), pendingList = new Set<() => void>(), pending = new Set<() => void>();
  const pendingProbe = new Set<() => void>(), pendingStart = new Set<() => void>(), pendingDisconnect = new Set<() => void>();
  const pendingInitial = new Map<PickerRequest, { endpoint: InitialEndpoint; release(outcome: InitialOutcome): void }>();
  const flowId = "e5cc5c70-e05a-4a3a-a837-bb46c99b372b", draftId = "f44789cb-40c6-42cb-bdbe-c0995bcaa07c";
  const userKey = "fixture-private-user", flowKey = `stagekeeper.github.flow.${userKey}`, cancelKey = `stagekeeper.github.cancel.${userKey}`;
  sessionStorage.removeItem(flowKey); sessionStorage.removeItem(cancelKey);
  if (["private-restoring", "private-session-race", "private-focus"].includes(mode)) sessionStorage.setItem(flowKey, flowId);
  if (initialCase && ["draft", "both", "late", "strict", "serial"].includes(initialCase)) sessionStorage.setItem(flowKey, flowId);
  if (initialCase && ["cancel", "cancel-both", "serial"].includes(initialCase)) sessionStorage.setItem(cancelKey, draftId);
  githubControls.requests.length = 0;
  githubControls.requestRecords.length = 0;
  githubControls.releaseInitial = (endpoint, outcome = "success") => {
    const held = [...pendingInitial.values()].find(request => request.endpoint === endpoint);
    if (!held) throw new Error(`No pending initial ${endpoint} request`);
    held.release(outcome);
  };
  githubControls.releaseDraft = () => { for (const finish of [...pendingDraft]) finish(); };
  githubControls.releaseList = () => { for (const finish of [...pendingList]) finish(); };
  githubControls.expire = () => { expired = true; };
  githubControls.failList = () => { failList = true; };
  githubControls.changeBranch = () => { changedBranch = true; };
  githubControls.limitList = () => { limited = true; };
  githubControls.allowList = () => { limited = false; };
  githubControls.elapseCooldown = () => { clock += 31_000; };
  githubControls.expireCooldown = () => {
    clock += 31_000;
    const timers = [...cooldownTimers.values()]; cooldownTimers.clear();
    for (const finish of timers) finish();
  };
  githubControls.limitProbe = () => { probeFailure = 429; };
  githubControls.failProbe = () => { probeFailure = 503; };
  githubControls.holdProbe = () => { heldProbe = true; };
  githubControls.releaseProbe = () => { pendingProbe.values().next().value?.(); };
  githubControls.releaseStart = () => { pendingStart.values().next().value?.(); };
  githubControls.releaseDisconnect = () => { pendingDisconnect.values().next().value?.(); };
  githubControls.pendingCount = () => pending.size;
  githubControls.cooldownTimerCount = () => cooldownTimers.size;
  const repo = () => ({ source: "authorized" as const, repositoryId: "99", installationId: "9", repositoryPage: 1, owner: "private-org", name: "private-service", fullName: "private-org/private-service",
    defaultBranch: mode === "private-null" ? null : changedBranch ? "remote-branch" : "release", visibility: "private" as const, connectionRevision: changedBranch ? 5 : 4 });
  function initialResponse(endpoint: InitialEndpoint, outcome: Exclude<InitialOutcome, "network">): Response {
    if (outcome === "unauthenticated") return Response.json({ ok: false, code: "UNAUTHENTICATED", message: "Sign in again." }, { status: 401 });
    if (outcome === "reauth-required") return Response.json({ ok: false, code: "REAUTH_REQUIRED", message: "Reconnect the repository list." }, { status: 403 });
    if (outcome === "unavailable") return Response.json({ ok: false, code: "UNAVAILABLE", message: "Fixture initial request unavailable." }, { status: 503 });
    if (outcome === "invalid") return Response.json({ invalid: true });
    if (outcome === "invalid-value") return Response.json({ ok: true, value: { invalid: true } });
    if (endpoint === "cancel") return Response.json({ ok: true, value: null });
    if (endpoint === "draft") return Response.json({ ok: true, value: { draft: { id: draftId, flowId, generation: 4, value: {
      selection: { source: "authorized", repository: repo() }, slug: "saved-slug", name: "Saved name", branch: "saved-branch",
      slugTouched: true, branchTouched: true, manual: false, editing: true, urlDraft: "",
    } } } });
    return Response.json({ ok: true, value: { repositories: outcome === "empty" ? [] : [repo()], nextCursor: null,
      connectionRevision: 4, failedInstallations: outcome === "partial" ? ["other-installation"] : [],
      unsupportedCount: outcome === "partial" ? 2 : 0, status: outcome === "partial" ? "partial" : outcome === "empty" ? "empty" : "ready" } });
  }
  function holdInitial(endpoint: InitialEndpoint, record: PickerRequest, signal: AbortSignal | null | undefined): Promise<Response> {
    return new Promise((resolve, reject) => {
      const clear = () => { pendingInitial.delete(record); pending.delete(cancel); signal?.removeEventListener("abort", abort); };
      const cancel = () => { clear(); reject(new DOMException("Aborted", "AbortError")); };
      const abort = () => { if (initialCase !== "late") cancel(); };
      if (signal?.aborted && initialCase !== "late") { cancel(); return; }
      pendingInitial.set(record, { endpoint, release(outcome) {
        clear();
        if (outcome === "network") reject(new Error("Fixture initial network failure"));
        else resolve(initialResponse(endpoint, outcome));
      } });
      pending.add(cancel); signal?.addEventListener("abort", abort, { once: true });
    });
  }
  function defer(response: Response, group: Set<() => void>, signal: AbortSignal | null | undefined): Promise<Response> {
    return new Promise((resolve, reject) => {
      const finish = () => { clear(); resolve(response); };
      const abort = () => { clear(); reject(new DOMException("Aborted", "AbortError")); };
      const clear = () => { group.delete(finish); pending.delete(abort); signal?.removeEventListener("abort", abort); };
      if (signal?.aborted) { abort(); return; }
      group.add(finish); pending.add(abort); signal?.addEventListener("abort", abort, { once: true });
    });
  }
  async function respond(url: URL, init: RequestInit | undefined, record: PickerRequest): Promise<Response> {
    if (expired) return Response.json({ ok: false, code: "UNAUTHENTICATED", message: "Sign in again." }, { status: 401 });
    const endpoint: InitialEndpoint | null = url.pathname.endsWith("/cancel") ? "cancel"
      : url.pathname.endsWith("/draft") && init?.method !== "POST" && url.searchParams.has("flowId") ? "draft"
        : url.pathname.endsWith("/repositories") ? "list" : null;
    if (initialCase && endpoint) {
      const held = endpoint === "cancel" ? ["cancel", "cancel-both", "serial"].includes(initialCase)
        : endpoint === "draft" ? ["draft", "both", "late", "strict", "serial"].includes(initialCase)
          : ["list", "both", "late", "strict", "cancel-both"].includes(initialCase);
      if (held) return holdInitial(endpoint, record, init?.signal);
      return initialResponse(endpoint, initialCase === "empty" ? "empty" : initialCase === "partial" ? "partial" : "success");
    }
    if (url.pathname.endsWith("/start")) {
      const response = Response.json({ ok: false, code: "UNAVAILABLE", message: "Fixture connection unavailable." }, { status: 503 });
      return mode === "private-operation" ? defer(response, pendingStart, init?.signal) : response;
    }
    if (url.pathname.endsWith("/disconnect")) {
      const response = Response.json({ ok: true, value: { stopped: true, providerRevoked: false } });
      return mode === "private-operation" ? defer(response, pendingDisconnect, init?.signal) : response;
    }
    if (url.pathname.endsWith("/cancel") || init?.method === "POST" && url.pathname.endsWith("/draft")) return Response.json({ ok: true, value: null });
    if (url.pathname.endsWith("/draft")) {
      if (!url.searchParams.has("flowId")) {
        if (heldProbe) {
          heldProbe = false;
          return defer(Response.json({ ok: false, code: "UNAUTHENTICATED", message: "Old session response." }, { status: 401 }), pendingProbe, init?.signal);
        }
        if (probeFailure) return Response.json({ ok: false, code: probeFailure === 429 ? "RATE_LIMITED" : "UNAVAILABLE", message: "Probe unavailable." }, { status: probeFailure });
        return Response.json({ ok: true, value: { draft: null } });
      }
      const response = Response.json({ ok: true, value: { draft: { id: draftId, flowId, generation: 4, value: { selection: { source: "authorized", repository: repo() },
        slug: "saved-slug", name: "Saved name", branch: "saved-branch", slugTouched: true, branchTouched: true, manual: false, editing: true, urlDraft: "" } } } });
      return defer(response, pendingDraft, init?.signal);
    }
    if (failList) return Response.json({ ok: false, code: "UNAVAILABLE", message: "Fixture repository reload failed." }, { status: 503 });
    if (limited) return Response.json({ ok: false, code: "RATE_LIMITED", message: "Wait before retrying repositories." }, { status: 429, headers: { "Retry-After": "30" } });
    const response = Response.json({ ok: true, value: { repositories: [repo()], nextCursor: mode === "private-pagination" ? "next" : null,
      connectionRevision: changedBranch ? 5 : 4, failedInstallations: [], unsupportedCount: 0, status: "ready" } });
    return mode === "private-loading" || mode === "private-focus" || mode === "private-pagination" && url.searchParams.has("cursor") ? defer(response, pendingList, init?.signal) : response;
  }
  window.fetch = async (input, init) => {
    const address = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const url = new URL(address, location.origin);
    if (!url.pathname.startsWith("/api/github/")) return original(input, init);
    const method = init?.method ?? "GET";
    githubControls.requests.push(`${method} ${url.pathname}`);
    const record: PickerRequest = { id: githubControls.requestRecords.length + 1, method, path: url.pathname, search: url.search,
      body: typeof init?.body === "string" ? JSON.parse(init.body) as unknown : null, aborted: init?.signal?.aborted ?? false, settled: false };
    githubControls.requestRecords.push(record);
    const abort = () => { record.aborted = true; };
    init?.signal?.addEventListener("abort", abort, { once: true });
    try { return await respond(url, init, record); }
    finally { record.settled = true; init?.signal?.removeEventListener("abort", abort); }
  };
  return { initial: { userKey, connection: { available: initialCase !== "off",
    status: mode === "private-consent" || initialCase === "disconnected" ? "not-connected" : "connected", revision: 4, notice: null } },
    cleanup() {
      window.fetch = original;
      Date.now = originalNow; browserWindow.setTimeout = originalSetTimeout; browserWindow.clearTimeout = originalClearTimeout;
      cooldownTimers.clear();
      if (visibility) Object.defineProperty(document, "visibilityState", visibility); else Reflect.deleteProperty(document, "visibilityState");
      for (const abort of [...pending]) abort();
      sessionStorage.removeItem(flowKey); sessionStorage.removeItem(cancelKey);
      githubControls.releaseDraft = () => {}; githubControls.releaseList = () => {}; githubControls.expire = () => {}; githubControls.failList = () => {}; githubControls.changeBranch = () => {};
      githubControls.limitList = () => {}; githubControls.allowList = () => {}; githubControls.expireCooldown = () => {}; githubControls.elapseCooldown = () => {};
      githubControls.limitProbe = () => {}; githubControls.failProbe = () => {}; githubControls.holdProbe = () => {}; githubControls.releaseProbe = () => {};
      githubControls.releaseStart = () => {}; githubControls.releaseDisconnect = () => {}; githubControls.pendingCount = () => 0; githubControls.cooldownTimerCount = () => 0;
      githubControls.releaseInitial = () => {};
    } };
}

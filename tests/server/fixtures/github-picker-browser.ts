import type { ComponentProps } from "react";
import type { NewProjectForm } from "@/fsd/features/create-project";

type PickerState = NonNullable<ComponentProps<typeof NewProjectForm>["picker"]>;
export const githubControls = {
  requests: [] as string[], releaseDraft: () => {}, releaseList: () => {}, expire: () => {}, failList: () => {}, changeBranch: () => {},
  limitList: () => {}, allowList: () => {}, expireCooldown: () => {}, elapseCooldown: () => {},
  limitProbe: () => {}, failProbe: () => {}, holdProbe: () => {}, releaseProbe: () => {}, releaseStart: () => {}, releaseDisconnect: () => {},
  pendingCount: () => 0, cooldownTimerCount: () => 0,
};

export function installGitHubPickerFixture(mode: string): { initial: PickerState; cleanup(): void } {
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
  const flowId = "e5cc5c70-e05a-4a3a-a837-bb46c99b372b", draftId = "f44789cb-40c6-42cb-bdbe-c0995bcaa07c";
  const userKey = "fixture-private-user", flowKey = `stagekeeper.github.flow.${userKey}`, cancelKey = `stagekeeper.github.cancel.${userKey}`;
  sessionStorage.removeItem(flowKey); sessionStorage.removeItem(cancelKey);
  if (["private-restoring", "private-session-race", "private-focus"].includes(mode)) sessionStorage.setItem(flowKey, flowId);
  githubControls.requests.length = 0;
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
  function defer(response: Response, group: Set<() => void>, signal: AbortSignal | null | undefined): Promise<Response> {
    return new Promise((resolve, reject) => {
      const finish = () => { clear(); resolve(response); };
      const abort = () => { clear(); reject(new DOMException("Aborted", "AbortError")); };
      const clear = () => { group.delete(finish); pending.delete(abort); signal?.removeEventListener("abort", abort); };
      if (signal?.aborted) { abort(); return; }
      group.add(finish); pending.add(abort); signal?.addEventListener("abort", abort, { once: true });
    });
  }
  window.fetch = async (input, init) => {
    const address = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const url = new URL(address, location.origin);
    if (!url.pathname.startsWith("/api/github/")) return original(input, init);
    githubControls.requests.push(`${init?.method ?? "GET"} ${url.pathname}`);
    if (expired) return Response.json({ ok: false, code: "UNAUTHENTICATED", message: "Sign in again." }, { status: 401 });
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
  };
  return { initial: { userKey, connection: { available: true, status: mode === "private-consent" ? "not-connected" : "connected", revision: 4, notice: null } },
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
    } };
}

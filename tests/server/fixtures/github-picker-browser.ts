import type { ComponentProps } from "react";
import type { NewProjectForm } from "@/fsd/features/create-project";

type PickerState = NonNullable<ComponentProps<typeof NewProjectForm>["picker"]>;
export const githubControls = { requests: [] as string[], releaseDraft: () => {}, releaseList: () => {}, expire: () => {}, failList: () => {}, changeBranch: () => {} };

export function installGitHubPickerFixture(mode: string): { initial: PickerState; cleanup(): void } {
  const original = window.fetch;
  const visibility = Object.getOwnPropertyDescriptor(document, "visibilityState");
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
  let expired = false, failList = false, changedBranch = false;
  const pendingDraft = new Set<() => void>(), pendingList = new Set<() => void>(), pending = new Set<() => void>();
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
    if (url.pathname.endsWith("/start")) return Response.json({ ok: false, code: "UNAVAILABLE", message: "Fixture connection unavailable." }, { status: 503 });
    if (url.pathname.endsWith("/disconnect")) return Response.json({ ok: true, value: { stopped: true, providerRevoked: false } });
    if (url.pathname.endsWith("/cancel") || init?.method === "POST" && url.pathname.endsWith("/draft")) return Response.json({ ok: true, value: null });
    if (url.pathname.endsWith("/draft")) {
      if (!url.searchParams.has("flowId")) return Response.json({ ok: true, value: { draft: null } });
      const response = Response.json({ ok: true, value: { draft: { id: draftId, flowId, generation: 4, value: { selection: { source: "authorized", repository: repo() },
        slug: "saved-slug", name: "Saved name", branch: "saved-branch", slugTouched: true, branchTouched: true, manual: false, editing: true, urlDraft: "" } } } });
      return defer(response, pendingDraft, init?.signal);
    }
    if (failList) return Response.json({ ok: false, code: "UNAVAILABLE", message: "Fixture repository reload failed." }, { status: 503 });
    const response = Response.json({ ok: true, value: { repositories: [repo()], nextCursor: mode === "private-pagination" ? "next" : null,
      connectionRevision: changedBranch ? 5 : 4, failedInstallations: [], unsupportedCount: 0, status: "ready" } });
    return mode === "private-loading" || mode === "private-focus" || mode === "private-pagination" && url.searchParams.has("cursor") ? defer(response, pendingList, init?.signal) : response;
  };
  return { initial: { userKey, connection: { available: true, status: mode === "private-consent" ? "not-connected" : "connected", revision: 4, notice: null } },
    cleanup() {
      window.fetch = original;
      if (visibility) Object.defineProperty(document, "visibilityState", visibility); else Reflect.deleteProperty(document, "visibilityState");
      for (const abort of [...pending]) abort();
      sessionStorage.removeItem(flowKey); sessionStorage.removeItem(cancelKey);
      githubControls.releaseDraft = () => {}; githubControls.releaseList = () => {}; githubControls.expire = () => {}; githubControls.failList = () => {}; githubControls.changeBranch = () => {};
    } };
}

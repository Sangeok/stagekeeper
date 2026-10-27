import assert from "node:assert/strict";
import { it } from "node:test";
import { formatWithOptions } from "node:util";
import { createElement, type ComponentProps, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NewProjectForm } from "../../src/fsd/features/create-project";
import { listPublicRepos } from "../../src/server/github/api.server";
import { loadModule } from "./fixtures/load-module";

it("distinguishes empty success, malformed responses, HTTP failure and request failure", async (t) => {
  const logs: unknown[][] = [];
  t.mock.method(console, "error", (...args: unknown[]) => { logs.push(args); });
  const fetchMock = t.mock.method(globalThis, "fetch");
  fetchMock.mock.mockImplementation(async () => new Response("[]"));
  assert.deepEqual(await listPublicRepos("user"), { ok: true, repos: [] });
  fetchMock.mock.mockImplementation(async () => new Response(JSON.stringify([null, 5, {}, { id: 1, owner: { login: "user" }, name: "archived", archived: true }, { id: 2, owner: { login: "user" }, name: "active" }, { id: 3, owner: { login: "org" }, name: "custom", default_branch: "dev" }, { id: 4, owner: { login: "user" }, name: "nulls", default_branch: null, archived: null }])));
  assert.deepEqual(await listPublicRepos("user"), { ok: true, repos: [{ source: "public", repositoryId: "2", owner: "user", name: "active", defaultBranch: "main" }, { source: "public", repositoryId: "3", owner: "org", name: "custom", defaultBranch: "dev" }, { source: "public", repositoryId: "4", owner: "user", name: "nulls", defaultBranch: "main" }] });
  fetchMock.mock.mockImplementation(async () => new Response("{}"));
  assert.deepEqual(await listPublicRepos("user"), { ok: false, category: "shape" });
  fetchMock.mock.mockImplementation(async () => new Response("<html>"));
  assert.deepEqual(await listPublicRepos("user"), { ok: false, category: "shape" });
  fetchMock.mock.mockImplementation(async () => new Response("sensitive-body", { status: 403 }));
  assert.deepEqual(await listPublicRepos("user"), { ok: false, category: "http" });
  fetchMock.mock.mockImplementation(async () => { throw new Error("sensitive-token"); });
  assert.deepEqual(await listPublicRepos("user"), { ok: false, category: "request" });
  assert.equal(logs.map(args => formatWithOptions({ depth: null }, ...args)).join(" ").includes("sensitive"), false);
});

it("bounds a stalled public response before headers with the existing request failure", { timeout: 1000 }, async (t) => {
  const controller = new AbortController();
  t.mock.method(console, "error", () => {});
  const timeout = t.mock.method(AbortSignal, "timeout", () => controller.signal);
  const request = t.mock.method(globalThis, "fetch", () => {
    return new Promise<Response>((_resolve, reject) => {
      controller.signal.addEventListener("abort", () => reject(controller.signal.reason), { once: true });
    });
  });
  const pending = listPublicRepos("user");
  assert.equal(timeout.mock.calls[0]?.arguments[0], 10_000);
  const init = request.mock.calls[0]?.arguments[1];
  assert.equal(init?.signal, controller.signal);
  assert.deepEqual(Reflect.get(init ?? {}, "next"), { revalidate: 300 });
  controller.abort();
  assert.deepEqual(await pending, { ok: false, category: "request" });
});

it("keeps the deadline active while reading the body and preserves the shape failure", { timeout: 1000 }, async (t) => {
  const controller = new AbortController();
  const reading = Promise.withResolvers<void>();
  t.mock.method(console, "error", () => {});
  const timeout = t.mock.method(AbortSignal, "timeout", () => controller.signal);
  let abortBody: (() => void) | undefined;
  t.after(() => { if (abortBody) controller.signal.removeEventListener("abort", abortBody); });
  const request = t.mock.method(globalThis, "fetch", async () => {
    const body = new ReadableStream<Uint8Array>({
      start(stream) {
        abortBody = () => stream.error(controller.signal.reason);
        controller.signal.addEventListener("abort", abortBody, { once: true });
      },
      pull() { reading.resolve(); },
    }, { highWaterMark: 0 });
    return new Response(body);
  });
  const pending = listPublicRepos("user");
  assert.equal(timeout.mock.calls[0]?.arguments[0], 10_000);
  assert.equal(request.mock.calls[0]?.arguments[1]?.signal, controller.signal);
  await reading.promise;
  controller.abort();
  assert.deepEqual(await pending, { ok: false, category: "shape" });
});

it("passes a failed public list through the real loader and route into the existing form recovery", async () => {
  for (const status of ["not-connected", "connected"] as const) {
    const connection = { available: true, status, revision: status === "connected" ? 3 : null, notice: null };
    const loader = loadModule<typeof import("../../src/fsd/features/create-project/index.server")>("src/fsd/features/create-project/api/repository-picker.server.ts", {
      "next/headers": { cookies: async () => ({ get: () => undefined }) },
      "@/server/github/api.server": {
        listPublicRepos: async (login: string) => { assert.equal(login, "login"); return { ok: false, category: "request" }; },
        loadRepositoryConnection: async (userId: string, browser: null) => { assert.equal(userId, "user"); assert.equal(browser, null); return connection; },
      },
    });
    let rendered: ComponentProps<typeof NewProjectForm> | undefined;
    const page = loadModule<{ default(): Promise<ReactElement> }>("src/app/(app)/p/new/page.tsx", {
      "@/fsd/features/create-project": { NewProjectForm: (props: ComponentProps<typeof NewProjectForm>) => { rendered = props; return createElement(NewProjectForm, props); } },
      "@/fsd/features/create-project/index.server": { ...loader, createProject: async () => ({ status: "idle" }) },
      "@/fsd/widgets/app-header": { AppHeader: () => null },
      "@/fsd/widgets/app-header/index.server": { loadHeaderUser: async () => ({ login: "login", plan: "free" }) },
      "@/server/auth/guard": { requireUser: async () => ({ userId: "user" }) },
      "@/server/public-url": { mcpUrl: () => "https://example.test/api/mcp" },
    });
    const html = renderToStaticMarkup(await page.default());
    assert.ok(rendered);
    assert.deepEqual(JSON.parse(JSON.stringify(rendered.repos)), []);
    assert.equal(rendered.repoLoadFailed, true);
    assert.equal(rendered.picker?.userKey, "user");
    if (status === "not-connected") { assert.match(html, /Repository URL/); assert.match(html, /load your repositories\. Paste a URL\./); }
    else { assert.match(html, /Paste a repository URL/); assert.match(html, /Manage repository access/); }
  }
});

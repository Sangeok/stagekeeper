import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import { it } from "node:test";
import ts from "typescript";

function load<T>(path: string, dependencies: Record<string, unknown>): T {
  const exports = {}, require = createRequire(import.meta.url);
  const code = ts.transpileModule(readFileSync(path, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  runInNewContext(code, { exports, Date, Response, Request, URL, Buffer, console, process: { env: { NODE_ENV: "test" } }, require: (name: string) => name === "server-only" ? {} : name in dependencies ? dependencies[name] : require(name) });
  return exports as T;
}

function fixture() {
  let userId: string | null = "user", calls = 0, body: unknown, mode = "success";
  const cookies = new Map<string, { value: string; options?: object }>();
  const helper = load<Record<string, unknown>>("src/app/api/github/request.ts", {
    "next/headers": { cookies: async () => ({ get: (name: string) => cookies.get(name), set: (name: string, value: string, options: object) => { cookies.set(name, { value, options }); } }) },
    "@/server/auth": { auth: async () => userId ? { user: { id: userId } } : null },
    "@/server/db": { prisma: { user: { findUnique: async () => ({ githubId: 7 }) } } },
    "@/server/public-url": { siteUrl: () => new URL("https://stagekeeper.test") },
    "@/server/usage/api.server": { limitAccountRequest: async () => null },
  });
  const service = async (input: unknown) => { calls++; body = input; return mode === "failure" ? { ok: false, code: "STALE_CONNECTION", message: "Reload repository access.", status: 409 }
    : { ok: true, value: { redirectTo: "https://github.com/apps/fixture/installations/new?state=new-state", attemptId: randomUUID() } }; };
  const api = { startRepositoryConnection: service, completeRepositoryAuthorization: service, completeRepositoryInstallation: service,
    listAuthorizedRepositories: service, loadConnectionDraft: async () => null, acknowledgeConnectionDraft: service, cancelRepositoryConnection: service, disconnectRepositoryList: service,
    handleGitHubWebhook: async () => { calls++; return mode === "failure" ? { ok: false, code: "INVALID_STATE", message: "Invalid request.", status: 401 } : { ok: true, value: null }; } };
  function route(path: string) { return load<{ GET?: (request: Request) => Promise<Response>; POST?: (request: Request) => Promise<Response> }>(`src/app/api/github/${path}/route.ts`, {
    "@/server/github/api.server": api, "../../request": helper, "../request": helper, "@/server/public-url": { siteUrl: () => new URL("https://stagekeeper.test") },
  }); }
  const request = (path: string, value: unknown = {}) => new Request(`https://stagekeeper.test/api/github/${path}`, { method: "POST",
    headers: { origin: "https://stagekeeper.test", "content-type": "application/json", "x-stagekeeper-request": "repository-picker", "x-stagekeeper-user": "user" }, body: JSON.stringify(value) });
  return { route, request, cookies, setUser: (value: string | null) => { userId = value; }, setMode: (value: string) => { mode = value; }, calls: () => calls, body: () => body };
}

it("starts through JSON and top-level navigation, preserves binding, and rejects cross-origin or changed-account mutations", async () => {
  const f = fixture(), start = f.route("connection/start").POST!;
  const response = await start(f.request("connection/start", { action: "authorize" }));
  assert.equal(response.status, 200); assert.equal(response.headers.get("location"), null); assert.match(response.headers.get("cache-control")!, /no-store/);
  const json = await response.json(); assert.equal(json.ok, true); assert.match(json.value.redirectTo, /^https:\/\/github.com\//);
  const binding = f.cookies.get("__Host-stagekeeper-github"); assert.ok(binding);
  assert.deepEqual({ ...binding.options }, { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 1200 });
  await start(f.request("connection/start")); assert.equal(f.cookies.get("__Host-stagekeeper-github")?.value, binding.value);
  const rejected = f.request("connection/start"); rejected.headers.set("origin", "https://other.test");
  assert.equal((await start(rejected)).status, 400); assert.equal(f.calls(), 2);
  f.setUser("other"); assert.equal((await start(f.request("connection/start"))).status, 401); assert.equal(f.calls(), 2);
});

it("returns JSON 401 for direct API requests and strips callback secrets on session loss", async () => {
  const f = fixture(); f.setUser(null);
  const listed = await f.route("repositories").GET!(new Request("https://stagekeeper.test/api/github/repositories"));
  assert.equal(listed.status, 401); assert.equal((await listed.json()).code, "UNAUTHENTICATED"); assert.equal(listed.headers.get("location"), null);
  for (const path of ["connection/callback", "connection/installation"]) {
    const response = await f.route(path).GET!(new Request(`https://stagekeeper.test/api/github/${path}?code=secret-canary&state=state-canary`));
    assert.equal(response.status, 303); assert.equal(response.headers.get("location"), "https://stagekeeper.test/login");
  }
  assert.equal(f.calls(), 0);
});

it("keeps callback failures on a fixed form URL and uses the revision-fenced disconnect result", async () => {
  const f = fixture(); await f.route("connection/start").POST!(f.request("connection/start")); f.setMode("failure");
  for (const path of ["connection/callback", "connection/installation"]) {
    const response = await f.route(path).GET!(new Request(`https://stagekeeper.test/api/github/${path}?code=canary&state=canary&installation_id=9`));
    assert.equal(response.status, 303); assert.equal(response.headers.get("location"), "https://stagekeeper.test/p/new");
  }
  assert.equal((await f.route("connection/disconnect").POST!(f.request("connection/disconnect", { revision: 1 }))).status, 409);
});

it("keeps signed webhook transport independent of sessions and bounds the raw payload", async () => {
  const f = fixture(); f.setUser(null);
  const handler = f.route("webhook").POST!;
  const valid = await handler(new Request("https://stagekeeper.test/api/github/webhook", { method: "POST", body: "{}" }));
  assert.equal(valid.status, 204); assert.equal(await valid.text(), "");
  f.setMode("failure"); assert.equal((await handler(new Request("https://stagekeeper.test/api/github/webhook", { method: "POST", body: "{}" }))).status, 401);
  const oversized = await handler(new Request("https://stagekeeper.test/api/github/webhook", { method: "POST", body: "x".repeat(262145) }));
  assert.equal(oversized.status, 413); assert.equal(f.calls(), 2);
});

it("implements all nine declared methods through the actual route modules", () => {
  const f = fixture();
  for (const [path, method] of [["connection/start", "POST"], ["connection/callback", "GET"], ["connection/installation", "GET"], ["connection/draft", "GET"], ["connection/draft", "POST"], ["connection/cancel", "POST"], ["connection/disconnect", "POST"], ["repositories", "GET"], ["webhook", "POST"]] as const) assert.equal(typeof f.route(path)[method], "function");
});

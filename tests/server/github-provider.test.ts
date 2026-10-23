import assert from "node:assert/strict";
import { formatWithOptions } from "node:util";
import { it } from "node:test";
import { createGitHubProvider } from "../../src/server/github/provider.server";

const configuration = { appId: "1", clientId: "client", clientSecret: "secret-canary", slug: "fixture-app", origin: "https://stagekeeper.test" };

it("sends PKCE and refresh secrets only in uncached POST bodies", async () => {
  const requests: { url: string; init?: RequestInit }[] = [];
  const provider = createGitHubProvider(configuration, async (url, init) => {
    requests.push({ url: String(url), init });
    return Response.json({ access_token: "ghu_new", refresh_token: "ghr_new", token_type: "bearer", expires_in: 28800, refresh_token_expires_in: 15897600 });
  });
  assert.ok((await provider.exchange("code-canary", "verifier-canary")).ok);
  assert.ok((await provider.refresh("refresh-canary")).ok);
  for (const request of requests) { assert.equal(request.init?.cache, "no-store"); assert.equal(request.init?.method, "POST"); assert.equal(request.url.includes("canary"), false); }
  const body = new URLSearchParams(String(requests[0].init?.body));
  assert.equal(body.get("code_verifier"), "verifier-canary"); assert.equal(body.get("redirect_uri"), "https://stagekeeper.test/api/github/connection/callback");
  assert.equal(new URLSearchParams(String(requests[1].init?.body)).get("grant_type"), "refresh_token");
});

it("rejects broad permissions, foreign pagination and unsupported non-expiring grants", async () => {
  const installation = { id: 9, app_id: 1, suspended_at: null, permissions: { metadata: "read" } };
  const broad = createGitHubProvider(configuration, async () => Response.json({ installations: [{ ...installation, permissions: { metadata: "read", contents: "read" } }] }));
  assert.equal((await broad.installations("ghu", 1)).ok, false);
  const foreign = createGitHubProvider(configuration, async () => Response.json({ installations: [installation] }, { headers: { Link: '<https://evil.test/user/installations?page=2&per_page=100>; rel="next"' } }));
  assert.equal((await foreign.installations("ghu", 1)).ok, false);
  const nonExpiring = createGitHubProvider(configuration, async () => Response.json({ access_token: "ghu", token_type: "bearer" }));
  assert.equal((await nonExpiring.exchange("code", "verifier")).ok, false);
});

it("classifies rate limits and excludes raw exceptions and provider bodies from logs", async t => {
  const logs: unknown[][] = []; t.mock.method(console, "error", (...args: unknown[]) => { logs.push(args); });
  const rate = createGitHubProvider(configuration, async () => new Response("private-name-canary", { status: 403, headers: { "x-ratelimit-remaining": "0", "retry-after": "45" } }));
  const result = await rate.repositories("ghu-canary", "9", 1); assert.ok(!result.ok); assert.equal(result.code, "RATE_LIMITED"); assert.equal(result.retryAfter, 45);
  const failed = createGitHubProvider(configuration, async () => { throw new Error("secret-canary"); });
  assert.equal((await failed.user("ghu-canary")).ok, false);
  assert.equal(logs.map(args => formatWithOptions({ depth: null }, ...args)).join(" ").includes("canary"), false);
});

it("revokes only an individual token and never a shared grant or installation", async () => {
  const urls: string[] = [];
  const provider = createGitHubProvider(configuration, async (url, init) => {
    urls.push(String(url)); assert.equal(init?.method, "DELETE"); assert.deepEqual(JSON.parse(String(init?.body)), { access_token: "ghu_old" });
    return new Response(null, { status: 204 });
  });
  assert.equal(await provider.revoke("ghu_old"), true);
  assert.deepEqual(urls, ["https://api.github.com/applications/client/token"]);
});

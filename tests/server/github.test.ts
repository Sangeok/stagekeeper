import assert from "node:assert/strict";
import { it } from "node:test";
import { listPublicRepos } from "../../src/server/github";

it("distinguishes empty success, malformed responses, HTTP failure and request failure", async (t) => {
  const logs: unknown[][] = [];
  t.mock.method(console, "error", (...args: unknown[]) => { logs.push(args); });
  const fetchMock = t.mock.method(globalThis, "fetch");
  fetchMock.mock.mockImplementation(async () => new Response("[]"));
  assert.deepEqual(await listPublicRepos("user"), { ok: true, repos: [] });
  fetchMock.mock.mockImplementation(async () => new Response(JSON.stringify([null, 5, {}, { name: "archived", archived: true }, { name: "active" }, { name: "custom", default_branch: "dev" }])));
  assert.deepEqual(await listPublicRepos("user"), { ok: true, repos: [{ name: "active", defaultBranch: "main" }, { name: "custom", defaultBranch: "dev" }] });
  fetchMock.mock.mockImplementation(async () => new Response("{}"));
  assert.deepEqual(await listPublicRepos("user"), { ok: false, category: "shape" });
  fetchMock.mock.mockImplementation(async () => new Response("sensitive-body", { status: 403 }));
  assert.deepEqual(await listPublicRepos("user"), { ok: false, category: "http" });
  fetchMock.mock.mockImplementation(async () => { throw new Error("sensitive-token"); });
  assert.deepEqual(await listPublicRepos("user"), { ok: false, category: "request" });
  assert.equal(JSON.stringify(logs).includes("sensitive"), false);
});

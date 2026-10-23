import assert from "node:assert/strict";
import { it } from "node:test";
import { formatWithOptions } from "node:util";
import { listPublicRepos } from "../../src/server/github/api.server";

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

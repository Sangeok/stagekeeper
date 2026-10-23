import assert from "node:assert/strict";
import { it } from "node:test";
import { authorizedRepositories, validateSelection } from "./repositories";
import { githubFixture } from "./test-fixture";
import { failure } from "./failure";

it("binds pagination to user and revision, omits unsupported rows and reports partial results", async () => {
  const f = githubFixture();
  f.deps.provider.repositories = async (_token, _installation, page) => ({ ok: true, value: { repositories: page === 1 ? [f.repository, { ...f.repository, repositoryId: "3", archived: true }, { ...f.repository, repositoryId: "4", visibility: "unsupported" }] : [{ ...f.repository, repositoryId: "5", owner: "second-org" }], nextPage: page === 1 ? 2 : null } });
  const first = await authorizedRepositories(f.deps, "u", null); assert.ok(first.ok);
  assert.equal(first.value.status, "partial"); assert.equal(first.value.unsupportedCount, 2); assert.equal(first.value.repositories.length, 1);
  assert.ok(first.value.nextCursor); assert.equal(first.value.nextCursor.includes("org"), false);
  const second = await authorizedRepositories(f.deps, "u", first.value.nextCursor); assert.ok(second.ok); assert.equal(second.value.repositories[0].owner, "second-org");
  assert.equal((await authorizedRepositories(f.deps, "other", first.value.nextCursor)).ok, false);
  f.setConnection({ revision: 5 }); assert.equal((await authorizedRepositories(f.deps, "u", first.value.nextCursor)).ok, false);
});

it("does not turn rate limits or installation failures into a successful empty list", async () => {
  const f = githubFixture(); f.deps.provider.repositories = async () => failure("RATE_LIMITED", 30);
  const limited = await authorizedRepositories(f.deps, "u", null); assert.ok(!limited.ok); assert.equal(limited.retryAfter, 30);
  f.deps.provider.repositories = async () => failure("PERMISSION_REQUIRED");
  const partial = await authorizedRepositories(f.deps, "u", null); assert.ok(partial.ok); assert.equal(partial.value.status, "partial"); assert.deepEqual(partial.value.failedInstallations, ["9"]);
});

it("requires live installation membership, canonical identity and current revision before registration", async () => {
  const f = githubFixture(); const selection = { repositoryId: "2", installationId: "9", repositoryPage: 1, owner: "org", name: "service", connectionRevision: 4 };
  assert.equal((await validateSelection(f.deps, "u", selection)).ok, true);
  assert.equal((await validateSelection(f.deps, "u", { ...selection, connectionRevision: 3 })).ok, false);
  assert.equal((await validateSelection(f.deps, "u", { ...selection, repositoryId: "3" })).ok, false);
  f.deps.provider.repository = async () => ({ ok: true, value: { ...f.repository, owner: "renamed-org" } });
  const renamed = await validateSelection(f.deps, "u", selection); assert.ok(!renamed.ok); assert.equal(renamed.code, "STALE_CONNECTION");
  f.setEnabled(false); assert.equal((await validateSelection(f.deps, "u", selection)).ok, false);
});

it("loads 101 repositories across pages and carries their verified lookup location", async () => {
  const f = githubFixture();
  f.deps.provider.repositories = async (_token, _installation, page) => ({ ok: true, value: { repositories: Array.from({ length: page === 1 ? 100 : 1 }, (_, index) => ({ ...f.repository, repositoryId: String((page - 1) * 100 + index + 1) })), nextPage: page === 1 ? 2 : null } });
  const first = await authorizedRepositories(f.deps, "u", null); assert.ok(first.ok && first.value.nextCursor);
  const second = await authorizedRepositories(f.deps, "u", first.value.nextCursor); assert.ok(second.ok);
  assert.equal(first.value.repositories.length + second.value.repositories.length, 101);
  assert.equal(second.value.repositories[0].repositoryPage, 2);
});

it("revalidates a late-page pick with one scoped page request and never trusts the page hint as authority", async () => {
  const f = githubFixture(); let requests = 0;
  const selection = { repositoryId: "2", installationId: "9", repositoryPage: 101, owner: "org", name: "service", connectionRevision: 4 };
  f.deps.provider.repositories = async (_token, _installation, page) => { requests++; assert.equal(page, 101); return { ok: true, value: { repositories: [f.repository], nextPage: 102 } }; };
  assert.equal((await validateSelection(f.deps, "u", selection)).ok, true); assert.equal(requests, 1);
  f.deps.provider.repositories = async () => { requests++; return { ok: true, value: { repositories: [], nextPage: null } }; };
  assert.equal((await validateSelection(f.deps, "u", selection)).ok, false);
  assert.equal((await validateSelection(f.deps, "u", { ...selection, repositoryPage: 0 })).ok, false); assert.equal(requests, 2);
});

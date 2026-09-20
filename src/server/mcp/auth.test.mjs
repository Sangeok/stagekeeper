import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { newToken } from "../../../packages/core/token.mjs";
import { makeVerifyOwnerToken, makeVerifyToken } from "./auth.ts";

describe("makeVerifyToken", () => {
  const { plain, hash } = newToken();
  const rows = { [hash]: { id: "tok1", projectId: "proj1", revokedAt: null } };
  const verify = makeVerifyToken(async (h) => rows[h] ?? null);
  const req = () => new Request("http://h.local/api/mcp");

  it("valid token → project scope in extra", async () => {
    const info = await verify(req(), plain);
    assert.equal(info.clientId, "proj1");
    assert.deepEqual(info.extra, { projectId: "proj1", tokenId: "tok1" });
  });
  it("missing, malformed, unknown, revoked → undefined (401 by withMcpAuth)", async () => {
    assert.equal(await verify(req(), undefined), undefined);
    assert.equal(await verify(req(), "nope"), undefined);
    assert.equal(await verify(req(), newToken().plain), undefined);
    const revoked = makeVerifyToken(async () => ({ id: "t", projectId: "p", revokedAt: new Date() }));
    assert.equal(await revoked(req(), plain), undefined);
  });
});

// hu_ — 사람만 알고 프로젝트는 모른다. 위 hs_ 단언은 그대로 통과해야 한다(A-2의 (o)).
describe("makeVerifyToken with a user token", () => {
  const agent = newToken();
  const user = newToken("user");
  const agentRows = { [agent.hash]: { id: "tok1", projectId: "proj1", revokedAt: null } };
  const userRows = { [user.hash]: { id: "usr1", userId: "user1", revokedAt: null } };
  const verify = makeVerifyToken(async (h) => agentRows[h] ?? null, async (h) => userRows[h] ?? null);
  const req = () => new Request("http://h.local/api/mcp");

  it("(n) valid user token → user scope in extra, clientId is the token id", async () => {
    const info = await verify(req(), user.plain);
    assert.deepEqual(info.scopes, ["agent"]);
    assert.equal(info.clientId, "usr1");
    assert.deepEqual(info.extra, { userId: "user1", tokenId: "usr1" });
  });
  it("(o) the agent token still resolves to project scope — the hu_ branch does not disturb it", async () => {
    const info = await verify(req(), agent.plain);
    assert.equal(info.clientId, "proj1");
    assert.deepEqual(info.extra, { projectId: "proj1", tokenId: "tok1" });
  });
  it("(p) an owner token is still refused, and so are unknown and revoked user tokens", async () => {
    assert.equal(await verify(req(), newToken("owner").plain), undefined);
    assert.equal(await verify(req(), newToken("user").plain), undefined);
    const revoked = makeVerifyToken(
      async () => null,
      async () => ({ id: "u", userId: "user1", revokedAt: new Date() }),
    );
    assert.equal(await revoked(req(), user.plain), undefined);
  });
  it("without the user lookup the verifier ignores hu_ entirely (hs_-only deployments)", async () => {
    const agentOnly = makeVerifyToken(async (h) => agentRows[h] ?? null);
    assert.equal(await agentOnly(req(), user.plain), undefined);
  });
});

describe("makeVerifyOwnerToken", () => {
  const { plain, hash } = newToken("owner");
  const rows = { [hash]: { id: "own1", projectId: "proj1", userId: "user1", revokedAt: null } };
  const verify = makeVerifyOwnerToken(async (h) => rows[h] ?? null);
  const req = () => new Request("http://h.local/api/mcp/owner");

  it("valid owner token → project + user scope in extra", async () => {
    const info = await verify(req(), plain);
    assert.deepEqual(info.scopes, ["owner"]);
    assert.deepEqual(info.extra, { projectId: "proj1", userId: "user1", ownerTokenId: "own1" });
  });
  it("an agent token is refused by the owner verifier, and vice versa", async () => {
    assert.equal(await verify(req(), newToken().plain), undefined);
    const agentVerify = makeVerifyToken(async () => ({ id: "t", projectId: "p", revokedAt: null }));
    assert.equal(await agentVerify(req(), plain), undefined);
  });
});

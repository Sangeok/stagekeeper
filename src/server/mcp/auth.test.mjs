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

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { newToken } from "../../../packages/core/token.mjs";
import { makeVerifyOwnerToken, makeVerifyToken } from "./auth.ts";

it("records accepted credentials once by internal ID while retaining AuthInfo and lookup failures", async () => {
  const req = new Request("http://h.local/api/mcp");
  for (const kind of ["agent", "user", "owner"]) {
    const token = newToken(kind);
    const calls = [];
    const lookup = async () => ({ id: "internal", projectId: "p", userId: "u", revokedAt: null });
    const recorder = async (...args) => { calls.push(args); };
    const verify = kind === "owner" ? makeVerifyOwnerToken(lookup, recorder) : makeVerifyToken(lookup, lookup, recorder);
    const info = await verify(req, token.plain);
    assert.equal(info.token, token.plain); assert.equal(calls.length, 1);
    assert.deepEqual(calls[0].slice(0, 2), [kind, "internal"]); assert.ok(calls[0][2] instanceof Date);
    const original = console.warn;
    try {
      console.warn = () => { throw new Error("diagnostic failure"); };
      const fail = async () => { throw new Error("recording failed"); };
      const failed = kind === "owner" ? makeVerifyOwnerToken(lookup, fail) : makeVerifyToken(lookup, lookup, fail);
      assert.deepEqual(await failed(req, token.plain), info);
    } finally { console.warn = original; }
    const unavailable = async () => { throw new Error("credential lookup failed"); };
    const broken = kind === "owner" ? makeVerifyOwnerToken(unavailable, recorder) : makeVerifyToken(unavailable, unavailable, recorder);
    await assert.rejects(broken(req, token.plain), /credential lookup failed/);
    assert.equal(calls.length, 1);
  }
});

it("does not record missing, malformed, wrong-kind, unknown or revoked credentials", async () => {
  let writes = 0;
  const record = async () => { writes++; };
  const req = new Request("http://h.local/api/mcp");
  for (const owner of [false, true]) {
    const kind = owner ? "owner" : "agent";
    for (const row of [null, { id: "t", projectId: "p", userId: "u", revokedAt: new Date() }]) {
      const find = async () => row;
      const verify = owner ? makeVerifyOwnerToken(find, record) : makeVerifyToken(find, find, record);
      for (const plain of [undefined, "malformed", newToken(kind).plain, newToken(owner ? "agent" : "owner").plain]) assert.equal(await verify(req, plain), undefined);
    }
  }
  assert.equal(writes, 0);
});

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

// hu_ — 사람만 알고 프로젝트는 모른다. 위 hs_ 단언은 그대로 통과해야 한다.
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

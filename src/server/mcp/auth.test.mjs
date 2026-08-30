import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { newToken } from "../../../packages/core/token.mjs";
import { makeVerifyToken } from "./auth.ts";

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

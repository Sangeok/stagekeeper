import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { authConfigBase } from "./config.base.ts";

const call = (pathname, user) =>
  authConfigBase.callbacks.authorized({ auth: user ? { user } : null, request: { nextUrl: new URL(`http://h.local${pathname}`) } });

describe("authorized", () => {
  it("unauthenticated: protected → false, /login → true", () => {
    assert.equal(call("/p/x", null), false);
    assert.equal(call("/login", null), true);
  });
  it("authenticated: protected → true, /login → redirect to /", () => {
    assert.equal(call("/p/x", { id: "u1" }), true);
    const r = call("/login", { id: "u1" });
    assert.ok(r instanceof Response);
    assert.equal(new URL(r.headers.get("location")).pathname, "/");
  });
});

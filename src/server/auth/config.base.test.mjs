import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AFTER_SIGN_IN, authConfigBase } from "./config.base";

const call = (pathname, user) =>
  authConfigBase.callbacks.authorized({ auth: user ? { user } : null, request: { nextUrl: new URL(`http://h.local${pathname}`) } });

describe("authorized", () => {
  it("keeps every documentation page public before and after sign-in without opening similar prefixes", () => {
    for (const path of ["/docs", "/docs/getting-started", "/docs/automation", "/docs/approval-gates", "/docs/security"]) {
      assert.equal(call(path, null), true, path);
      assert.equal(call(path, { id: "u1" }), true, path);
    }
    for (const path of ["/docs-private", "/docs/security/private", "/docs/getting-started/private", "/docs/unknown"]) {
      assert.equal(call(path, null), false, path);
    }
  });
  it("unauthenticated: landing and /login are public", () => {
    assert.equal(call("/", null), true);
    assert.equal(call("/login", null), true);
  });
  it("unauthenticated: everything else is protected — including /projects (the '/' rule is exact, not a prefix)", () => {
    assert.equal(call("/projects", null), false);
    assert.equal(call("/p/x", null), false);
    assert.equal(call("/p/new", null), false);
  });
  it("authenticated: protected routes and the landing are allowed", () => {
    assert.equal(call("/p/x", { id: "u1" }), true);
    assert.equal(call("/projects", { id: "u1" }), true);
    assert.equal(call("/", { id: "u1" }), true);
  });
  it("authenticated: /login redirects to the project list", () => {
    const r = call("/login", { id: "u1" });
    assert.ok(r instanceof Response);
    assert.equal(new URL(r.headers.get("location")).pathname, AFTER_SIGN_IN);
    assert.equal(AFTER_SIGN_IN, "/projects");
  });
});

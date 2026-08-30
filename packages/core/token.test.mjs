import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { hashToken, newToken, parseBearer } from "./token.mjs";

describe("token", () => {
  it("new tokens are prefixed, unique, and hash deterministically", () => {
    const a = newToken(), b = newToken();
    assert.match(a.plain, /^hs_[A-Za-z0-9_-]{43}$/);
    assert.notEqual(a.plain, b.plain);
    assert.equal(a.hash, hashToken(a.plain));
    assert.equal(a.hash.length, 64);
  });
  it("parseBearer accepts only well-formed harness tokens", () => {
    const { plain } = newToken();
    assert.equal(parseBearer(`Bearer ${plain}`), plain);
    assert.equal(parseBearer(`bearer ${plain}`), plain);
    assert.equal(parseBearer("Bearer nope"), null);
    assert.equal(parseBearer(null), null);
    assert.equal(parseBearer(`Token ${plain}`), null);
  });
});

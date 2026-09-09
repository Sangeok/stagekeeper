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
  it("owner tokens carry the ho_ prefix and are not accepted as agent tokens", () => {
    const owner = newToken("owner");
    assert.match(owner.plain, /^ho_[A-Za-z0-9_-]{43}$/);
    assert.equal(parseBearer(`Bearer ${owner.plain}`, "owner"), owner.plain);
    assert.equal(parseBearer(`Bearer ${owner.plain}`), null);           // 에이전트 파서는 ho_를 모른다
    assert.equal(parseBearer(`Bearer ${newToken().plain}`, "owner"), null); // 그 반대도
    assert.throws(() => newToken("admin"), /unknown token kind: admin/);
  });
});

import assert from "node:assert/strict";

import { it } from "node:test";

import { hashToken, newToken } from "./token-crypto";
import { parseBearer } from "@harness/shared/tokens/format.mjs";

it("new tokens are prefixed, unique, and hash deterministically", () => {
    const a = newToken(), b = newToken();
    assert.match(a.plain, /^hs_[A-Za-z0-9_-]{43}$/);
    assert.notEqual(a.plain, b.plain);
    assert.equal(a.hash, hashToken(a.plain));
    assert.equal(a.hash.length, 64);
  });

it("owner tokens carry the ho_ prefix and are not accepted as agent tokens", () => {
    const owner = newToken("owner");
    assert.match(owner.plain, /^ho_[A-Za-z0-9_-]{43}$/);
    assert.equal(parseBearer(`Bearer ${owner.plain}`, "owner"), owner.plain);
    assert.equal(parseBearer(`Bearer ${owner.plain}`), null);
    assert.equal(parseBearer(`Bearer ${newToken().plain}`, "owner"), null);
    assert.throws(() => newToken("admin"), /unknown token kind: admin/);
  });

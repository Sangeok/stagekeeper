import assert from "node:assert/strict";

import { it } from "node:test";

import { parseBearer } from "./format.mjs";

it("parseBearer accepts only well-formed harness tokens", () => {
    const plain = "hs_" + "a".repeat(43);
    assert.equal(parseBearer(`Bearer ${plain}`), plain);
    assert.equal(parseBearer(`bearer ${plain}`), plain);
    assert.equal(parseBearer("Bearer nope"), null);
    assert.equal(parseBearer(null), null);
    assert.equal(parseBearer(`Token ${plain}`), null);
  });

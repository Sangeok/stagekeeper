import assert from "node:assert/strict";
import { it } from "node:test";
import { SLUG_MAX, SLUG_RE, RESERVED_SLUGS } from "./project-slug.mjs";

it("accepts slug lengths two through forty", () => {
  assert.equal(SLUG_MAX, 40);
  for (const [length, accepted] of [[1, false], [2, true], [40, true], [41, false]]) {
    assert.equal(SLUG_RE.test("a".repeat(length)), accepted, String(length));
  }
});

it("requires a lowercase letter or number first and allows later dashes", () => {
  for (const slug of ["ab", "01", "a-b", "a-"]) assert.equal(SLUG_RE.test(slug), true, slug);
  for (const slug of ["", "-ab", "Ab", "a_b", "a.b", "a b", "a/b", "한글"]) assert.equal(SLUG_RE.test(slug), false, slug);
  assert.equal(SLUG_RE.flags, "");
  assert.equal(SLUG_RE.test("a-b"), true);
  assert.equal(SLUG_RE.test("a-b"), true);
});

it("reserves the new-project route without rejecting its slug syntax", () => {
  assert.deepEqual([...RESERVED_SLUGS], ["new"]);
  assert.equal(SLUG_RE.test("new"), true);
  assert.equal(RESERVED_SLUGS.has("new-project"), false);
});

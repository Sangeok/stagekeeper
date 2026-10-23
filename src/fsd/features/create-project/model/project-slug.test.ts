import assert from "node:assert/strict";
import { it } from "node:test";
import * as core from "@harness/core/project-slug.mjs";
import { SLUG_MAX, SLUG_RE, RESERVED_SLUGS, SLUG_HINT, SLUG_ERROR } from "./project-slug";

it("uses the core policy while retaining the web form's slug messages", () => {
  assert.equal(SLUG_MAX, core.SLUG_MAX);
  assert.equal(SLUG_RE, core.SLUG_RE);
  assert.equal(RESERVED_SLUGS, core.RESERVED_SLUGS);
  assert.equal(SLUG_HINT, "Becomes /p/<slug>. Lowercase letters, numbers, and dashes, 2–40 characters.");
  assert.equal(SLUG_ERROR, "Slug must be 2–40 lowercase letters, numbers, or dashes.");
});

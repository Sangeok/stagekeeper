import assert from "node:assert/strict";
import { it } from "node:test";

import { DOCS_PATHS, docsPath } from "./docs";

it("names exactly the five public documentation routes", () => {
  assert.deepEqual(DOCS_PATHS, {
    overview: "/docs",
    "getting-started": "/docs/getting-started",
    automation: "/docs/automation",
    "approval-gates": "/docs/approval-gates",
    security: "/docs/security",
  });
  for (const id of Object.keys(DOCS_PATHS) as Array<keyof typeof DOCS_PATHS>) assert.equal(docsPath(id), DOCS_PATHS[id]);
});

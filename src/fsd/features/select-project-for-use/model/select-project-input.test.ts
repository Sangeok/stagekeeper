import assert from "node:assert/strict";
import { it } from "node:test";
import { inputSchema } from "./select-project-input";

it("keeps replacement optional and checks identity/version boundaries without coercion", () => {
  for (const expectedVersion of [0, Number.MAX_SAFE_INTEGER]) {
    assert.deepEqual(inputSchema.parse({ targetProjectId: "project", expectedVersion }), { targetProjectId: "project", expectedVersion });
    assert.deepEqual(inputSchema.parse({ targetProjectId: "project", replacementProjectId: "other", expectedVersion, userId: "untrusted" }),
      { targetProjectId: "project", replacementProjectId: "other", expectedVersion });
  }
  for (const input of [null, [], {}, { targetProjectId: "", expectedVersion: 0 }, { targetProjectId: 1, expectedVersion: 0 },
    ...["", null, 1].map(replacementProjectId => ({ targetProjectId: "project", replacementProjectId, expectedVersion: 0 })),
    ...[-1, 0.5, Number.MAX_SAFE_INTEGER + 1, Infinity, NaN, "0", null].map(expectedVersion => ({ targetProjectId: "project", expectedVersion }))]) {
    assert.equal(inputSchema.safeParse(input).success, false);
  }
});

import assert from "node:assert/strict";
import { it } from "node:test";
import { inputSchema } from "./project-connection-input";

it("accepts the full version range without coercing untrusted connection input", () => {
  for (const expectedVersion of [0, Number.MAX_SAFE_INTEGER]) {
    assert.deepEqual(inputSchema.parse({ targetProjectId: "project", expectedVersion, userId: "untrusted" }), { targetProjectId: "project", expectedVersion });
  }
  for (const input of [null, [], {}, { targetProjectId: "", expectedVersion: 0 }, { targetProjectId: 1, expectedVersion: 0 },
    ...[-1, 0.5, Number.MAX_SAFE_INTEGER + 1, Infinity, NaN, "0", null].map(expectedVersion => ({ targetProjectId: "project", expectedVersion }))]) {
    assert.equal(inputSchema.safeParse(input).success, false);
  }
});

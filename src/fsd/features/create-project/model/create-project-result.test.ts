import assert from "node:assert/strict";
import { it } from "node:test";
import { toCreateProjectState } from "./create-project-result";

it("exposes a stored token only for created and uses the service's actual slug", () => {
  assert.deepEqual(toCreateProjectState({ status: "created", slug: "actual" }, "plain"), { status: "created", slug: "actual", token: "plain" });
  for (const status of ["existing", "disconnected"] as const) {
    const result = toCreateProjectState({ status, slug: "actual", reason: "disconnected" }, "unstored");
    assert.deepEqual(result, { status, slug: "actual" }); assert.equal("token" in result, false);
  }
  for (const status of ["capped", "integrity"] as const) assert.deepEqual(toCreateProjectState({ status, reason: "failure" }, "unstored"), { status: "error", error: "failure" });
});

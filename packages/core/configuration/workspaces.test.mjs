import assert from "node:assert/strict";
import { it } from "node:test";
import { validateWorkspaceSemantics } from "./workspaces.mjs";

it("normalized workspace semantics reject each unsupported shape without trimming commands", () => {
  const valid = { id: "web", path: ".", agent: "dev", verify: [" npm test "], knowledge: null, readOnly: [] };
  assert.deepEqual(validateWorkspaceSemantics([valid]), [valid]);
  for (const patch of [{ id: "" }, { path: "" }, { agent: "Dev" }, { agent: "pm" }, { verify: [] }, { verify: [""] }, { knowledge: "" }, { knowledge: undefined }, { readOnly: undefined }, { readOnly: [""] }]) {
    assert.throws(() => validateWorkspaceSemantics([{ ...valid, ...patch }]));
  }
  assert.throws(() => validateWorkspaceSemantics([valid, valid]), /duplicate agent/);
});

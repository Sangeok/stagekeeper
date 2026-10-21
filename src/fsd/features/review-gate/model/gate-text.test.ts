import assert from "node:assert/strict";
import { it } from "node:test";

import { gateLockLabel, gatePendingLabel, gateToast, holdNoteLabel } from "./gate-text";

it("labels a hold note by who put the item on hold", () => {
  assert.equal(holdNoteLabel("human", "web-dev"), "Your note");
  assert.equal(holdNoteLabel("agent", "web-dev"), "web-dev's note");
  assert.equal(holdNoteLabel(null, "web-dev"), "Your note");
});

it("names the implementation check and QA gates after the button is pressed", () => {
  for (const [gate, toast] of [["before-impl-verify", "Continued to implementation check · K-1"], ["before-qa", "Continued to QA · K-1"]] as const) {
    assert.equal(gatePendingLabel(gate), "Continuing…", gate);
    assert.equal(gateLockLabel(gate), "Continued", gate);
    assert.equal(gateToast(gate, "K-1"), toast);
  }
});

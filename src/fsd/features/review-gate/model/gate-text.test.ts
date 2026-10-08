// 버튼을 누른 뒤의 낱말이 그 게이트를 잇는지 본다(product-copy.md §3). 표에 없으면 "Moving…"·"Done"·"Moved"가 보인다.
import assert from "node:assert/strict";
import { it } from "node:test";

import { gateLockLabel, gatePendingLabel, gateToast } from "./gate-text";

it("names the implementation check and QA gates after the button is pressed", () => {
  for (const [gate, toast] of [["before-impl-verify", "Continued to implementation check · K-1"], ["before-qa", "Continued to QA · K-1"]] as const) {
    assert.equal(gatePendingLabel(gate), "Continuing…", gate);
    assert.equal(gateLockLabel(gate), "Continued", gate);
    assert.equal(gateToast(gate, "K-1"), toast);
  }
});

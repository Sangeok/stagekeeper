// 버튼을 누른 뒤의 낱말이 그 게이트를 잇는지 본다(product-copy.md §3). 표에 없으면 "Moving…"·"Done"·"Moved"가 보인다.
import assert from "node:assert/strict";
import { it } from "node:test";

import { gateLockLabel, gatePendingLabel, gateToast, holdNoteLabel } from "./gate-text";

it("labels a hold note by who put the item on hold", () => {
  assert.equal(holdNoteLabel("human", "web-dev"), "Your note");
  assert.equal(holdNoteLabel("agent", "web-dev"), "web-dev's note");
  // 보류 이벤트가 이벤트 창 밖이면 누가 보류했는지 모른다 — 예전 이름표를 그대로 쓴다.
  assert.equal(holdNoteLabel(null, "web-dev"), "Your note");
});

it("names the implementation check and QA gates after the button is pressed", () => {
  for (const [gate, toast] of [["before-impl-verify", "Continued to implementation check · K-1"], ["before-qa", "Continued to QA · K-1"]] as const) {
    assert.equal(gatePendingLabel(gate), "Continuing…", gate);
    assert.equal(gateLockLabel(gate), "Continued", gate);
    assert.equal(gateToast(gate, "K-1"), toast);
  }
});

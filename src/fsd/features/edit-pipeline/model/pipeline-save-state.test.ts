import assert from "node:assert/strict";
import { it } from "node:test";
import { copyLock } from "@/fsd/shared/lib/copy-lock";
import { PIPELINE_STALE, PIPELINE_UNKNOWN } from "./pipeline-save-state";

it("matches the canonical pipeline recovery copy without reusing board refresh messages", () => {
  assert.deepEqual(copyLock("pipeline-save-recovery"), [PIPELINE_STALE, PIPELINE_UNKNOWN, "Discard changes and reload"]);
});

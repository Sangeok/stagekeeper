import assert from "node:assert/strict";
import { it } from "node:test";
import { copyLock } from "@/fsd/shared/lib/copy-lock";
import { formatSetupDetail } from "./setup-detail";
import { deriveTurn } from "./turn";

it("selects the locked init guidance while preserving the server setup decision", () => {
  const turn = deriveTurn([], { tokenIssued: true, rosterSynced: false });
  assert.equal(turn.kind, "setup");
  if (turn.kind !== "setup") throw new Error("Expected setup");
  const before = structuredClone(turn);
  for (const client of ["claude", "codex"] as const) {
    for (const step of turn.steps) {
      const detail = formatSetupDetail(step, client);
      assert.equal(detail, step.key === "connect" ? copyLock(`turn-banner-connect-${client}`)[0] : step.detail);
    }
  }
  assert.deepEqual(turn, before);
});

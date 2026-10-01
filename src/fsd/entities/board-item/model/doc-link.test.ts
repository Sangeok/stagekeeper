import assert from "node:assert/strict";
import { it } from "node:test";
import { blobHref, reportDocLabel, reportIsAcceptance, orderReportActors } from "./doc-link";

it("preserves explicit submission purpose after reopen or a later acceptance", () => {
  const at = new Date("2026-09-01T00:00:00.000Z");
  const later = new Date(at.getTime() + 1);
  assert.equal(reportIsAcceptance({ at, isAcceptance: true }, null), true);
  assert.equal(reportIsAcceptance({ at, isAcceptance: true }, later), true);
  assert.equal(reportIsAcceptance({ at: later, isAcceptance: false }, at), false);
  for (const isAcceptance of [null, undefined]) {
    assert.equal(reportIsAcceptance({ at, isAcceptance }, at), true);
    assert.equal(reportIsAcceptance({ at, isAcceptance }, later), false);
    assert.equal(reportIsAcceptance({ at, isAcceptance }, null), false);
  }
});

it("keeps prototype-shaped workspace actors as implementation reports in deterministic role order", () => {
  const actors = ["constructor", "toString", "__proto__", "hasOwnProperty"];
  for (const actor of actors) assert.equal(reportDocLabel(actor), "Implementation report");
  assert.deepEqual(orderReportActors(new Set(["feature-scout", "main-loop", "doc-auditor", "z-dev", ...actors])),
    ["main-loop", ...["z-dev", ...actors].sort(), "doc-auditor", "feature-scout"]);
});

it("keeps report labels and recorded-commit links owned by the entity", () => {
  for (const [actor, label] of [["main-loop", "Validation record"], ["doc-auditor", "Audit report"],
    ["feature-scout", "Scouting report"], ["custom-dev", "Implementation report"]]) {
    assert.equal(reportDocLabel(actor), label);
  }
  assert.equal(reportDocLabel("main-loop", true), "Acceptance record");
  assert.equal(reportDocLabel("custom-dev", true), "Implementation report");
  assert.equal(blobHref({ owner: "owner", repo: "repo", branch: "main" }, "docs/r.md", "abcdef123"),
    "https://github.com/owner/repo/blob/abcdef123/docs/r.md");
});

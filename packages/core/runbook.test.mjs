import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { RUNBOOK_TEMPLATE, isRunbookVersion, runbookIsStale, runbookVersion } from "./runbook.mjs";

const BODY = "# {{project.name}} — pipeline runbook\n\nAsk pipeline_next.\n";
const OTHER = "# {{project.name}} — 파이프라인 런북\n\npipeline_next에 물어라.\n";

describe("runbook", () => {
  it("names the template the version is computed from", () => {
    assert.equal(RUNBOOK_TEMPLATE, "CLAUDE.runbook.md");
  });

  it("versions the raw template body, deterministically and short", () => {
    assert.equal(runbookVersion(BODY), runbookVersion(BODY));
    assert.match(runbookVersion(BODY), /^[0-9a-f]{12}$/);
    assert.notEqual(runbookVersion(BODY), runbookVersion(OTHER));
  });

  it("a one-character edit is a different version", () => {
    assert.notEqual(runbookVersion(BODY), runbookVersion(BODY + " "));
  });

  it("matching any current language's body is current", () => {
    assert.equal(runbookIsStale(runbookVersion(BODY), [BODY, OTHER]), false);
    assert.equal(runbookIsStale(runbookVersion(OTHER), [BODY, OTHER]), false);
  });

  it("a version no current body produces is stale", () => {
    assert.equal(runbookIsStale(runbookVersion("older body\n"), [BODY, OTHER]), true);
  });

  it("never reported counts as stale", () => {
    assert.equal(runbookIsStale(null, [BODY]), true);
  });

  it("accepts only what runbookVersion produces as a version", () => {
    assert.equal(isRunbookVersion(runbookVersion(BODY)), true);
    for (const bad of ["", "abc", "ABCDEF123456", "0123456789abc", "0123456789a", "0123456789ag", " 0123456789ab", null, undefined, 12]) {
      assert.equal(isRunbookVersion(bad), false, String(bad));
    }
  });

  it("no current body at all is stale, whatever was stored", () => {
    assert.equal(runbookIsStale(runbookVersion(BODY), []), true);
    assert.equal(runbookIsStale(null, []), true);
  });
});

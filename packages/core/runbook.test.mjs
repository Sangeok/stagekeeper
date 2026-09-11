import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { RUNBOOK_TEMPLATE, runbookIsStale, runbookVersion } from "./runbook.mjs";

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

  // 한 글자만 달라도 다른 판이다 — 표류를 잡자는 것이므로 근사 비교는 없다.
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

  // 보고된 적이 없으면 맞다는 근거가 없다. init은 멱등하므로 모를 때 알리는 쪽이 싸다.
  it("never reported counts as stale", () => {
    assert.equal(runbookIsStale(null, [BODY]), true);
  });

  // 템플릿을 못 읽었는데 "현재"라고 답하면 표류를 영원히 숨긴다.
  it("no current body at all is stale, whatever was stored", () => {
    assert.equal(runbookIsStale(runbookVersion(BODY), []), true);
    assert.equal(runbookIsStale(null, []), true);
  });
});

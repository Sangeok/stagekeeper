import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseBacklog } from "./backlog-md.mjs";

const MD = [
  "# TASK_BACKLOG", "", "> 머리말", "", "## Credit / Billing", "",
  "- [ ] **FEAT-01**: Credit System 마무리 (현재 개발 중 상태)",
  "  - area: apps/web/src/fsd/features/billing + apps/web/src/inngest",
  "  - source: README \"Currently in Development\"",
  "", "## Pipeline", "",
  "- [ ] **FEAT-28**: 부분 성공 클립의 메타데이터를 사용자에게 전달",
  "  - area: apps/web/src/inngest",
  "  - source: BUG-08 계획서 「범위 밖 의존」. **관측**: … **진단(코드 확정)**: …",
  "", "## 비고", "- 위 항목의 우선순위는 …",
].join("\n");

describe("parseBacklog", () => {
  it("extracts key/title/area/source per item", () => {
    const items = parseBacklog(MD);
    assert.deepEqual(items.map((i) => i.key), ["FEAT-01", "FEAT-28"]);
    assert.equal(items[0].title, "Credit System 마무리 (현재 개발 중 상태)");
    assert.equal(items[0].area, "apps/web/src/fsd/features/billing + apps/web/src/inngest");
    assert.equal(items[0].source, "README \"Currently in Development\"");
    assert.equal(items[1].source, "BUG-08 계획서 「범위 밖 의존」. **관측**: … **진단(코드 확정)**: …");
  });
  it("ignores prose bullets and missing fields become empty strings", () => {
    const items = parseBacklog("## X\n- [ ] **BUG-09**: 제목만\n- 그냥 불릿\n");
    assert.equal(items.length, 1); assert.equal(items[0].area, ""); assert.equal(items[0].source, "");
  });
});

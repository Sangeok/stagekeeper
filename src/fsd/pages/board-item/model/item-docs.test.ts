// 라벨과 순서가 entities/board-item 하나에서 오는 것을 고정한다. 예전에는 라우트가
// "main-loop report"처럼 직접 지어 붙여서, 라벨 주인(doc-link.ts)이 부르는 이름과 달랐다.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { toItemDocs } from "./item-docs";

const repo = { owner: "Sangeok", repo: "harness-smoke", branch: "main" };

describe("toItemDocs", () => {
  it("labels and orders reports the way the entity declares", () => {
    const docs = toItemDocs(
      {
        planPath: "docs/plans/FEAT-02.md",
        reports: [
          { actor: "doc-auditor", path: "docs/agents/doc-auditor/FEAT-02.md" },
          { actor: "dev", path: "docs/agents/dev/FEAT-02.md" },
          { actor: "main-loop", path: "docs/agents/main-loop/FEAT-02.md" },
        ],
      },
      repo,
    );
    assert.deepEqual(
      docs.map((d) => d.label),
      ["Plan", "Validation record", "Implementation report", "Audit report"],
    );
    assert.equal(docs[0]?.href, "https://github.com/Sangeok/harness-smoke/blob/main/docs/plans/FEAT-02.md");
  });

  it("keeps every report when one actor filed more than once", () => {
    const docs = toItemDocs(
      {
        planPath: null,
        reports: [
          { actor: "dev", path: "docs/agents/dev/FEAT-02.md" },
          { actor: "dev", path: "docs/agents/dev/FEAT-02-2.md" },
        ],
      },
      repo,
    );
    assert.deepEqual(docs.map((d) => d.path), ["docs/agents/dev/FEAT-02.md", "docs/agents/dev/FEAT-02-2.md"]);
  });

  it("is empty when there is no plan and no report", () => {
    assert.deepEqual(toItemDocs({ planPath: null, reports: [] }, repo), []);
  });
});

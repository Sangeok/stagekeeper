// 라벨과 순서가 entities/board-item 하나에서 오는 것을 고정한다. 예전에는 라우트가
// "main-loop report"처럼 직접 지어 붙여서, 라벨 주인(doc-link.ts)이 부르는 이름과 달랐다.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { toItemDocs } from "./item-docs";

const repo = { owner: "Sangeok", repo: "harness-smoke", branch: "main" };
const at = (iso: string) => new Date(iso);
const report = (actor: string, path: string, commit = "0000000", iso = "2026-09-06T14:00:00Z") => ({ actor, path, commit, at: at(iso) });

describe("toItemDocs", () => {
  it("labels and orders reports the way the entity declares; the plan opens its recorded commit", () => {
    const docs = toItemDocs(
      {
        planPath: "docs/plans/FEAT-02.md",
        planCommit: "b72a941",
        acceptedAt: null,
        reports: [
          report("doc-auditor", "docs/agents/doc-auditor/FEAT-02.md", "1111111"),
          report("dev", "docs/agents/dev/FEAT-02.md", "2222222"),
          report("main-loop", "docs/agents/main-loop/FEAT-02.md", "3333333"),
        ],
      },
      repo,
    );
    assert.deepEqual(
      docs.map((d) => d.label),
      ["Plan", "Validation record", "Implementation report", "Audit report"],
    );
    assert.equal(docs[0]?.href, "https://github.com/Sangeok/harness-smoke/blob/b72a941/docs/plans/FEAT-02.md"); // planCommit
    assert.equal(docs[2]?.href, "https://github.com/Sangeok/harness-smoke/blob/2222222/docs/agents/dev/FEAT-02.md"); // 보고는 자기 커밋
  });

  it("falls back to the branch while the plan has no recorded commit", () => {
    const docs = toItemDocs({ planPath: "docs/plans/FEAT-02.md", planCommit: null, acceptedAt: null, reports: [] }, repo);
    assert.equal(docs[0]?.href, "https://github.com/Sangeok/harness-smoke/blob/main/docs/plans/FEAT-02.md");
  });

  it("labels the main-loop report at or after acceptedAt as the acceptance record", () => {
    const docs = toItemDocs(
      {
        planPath: null,
        planCommit: null,
        acceptedAt: at("2026-09-06T15:10:00Z"),
        reports: [
          report("main-loop", "docs/agents/main-loop/FEAT-04.md", "e148d97", "2026-09-06T14:50:00Z"),
          report("main-loop", "docs/agents/main-loop/FEAT-04.md", "4cb9012", "2026-09-06T15:10:00Z"),
          report("dev", "docs/agents/dev/FEAT-04.md", "9999999", "2026-09-06T15:00:00Z"),
        ],
      },
      repo,
    );
    assert.deepEqual(docs.map((d) => d.label), ["Validation record", "Acceptance record", "Implementation report"]);
  });

  it("keeps every report when one actor filed more than once", () => {
    const docs = toItemDocs(
      {
        planPath: null,
        planCommit: null,
        acceptedAt: null,
        reports: [report("dev", "docs/agents/dev/FEAT-02.md"), report("dev", "docs/agents/dev/FEAT-02-2.md")],
      },
      repo,
    );
    assert.deepEqual(docs.map((d) => d.path), ["docs/agents/dev/FEAT-02.md", "docs/agents/dev/FEAT-02-2.md"]);
  });

  it("is empty when there is no plan and no report", () => {
    assert.deepEqual(toItemDocs({ planPath: null, planCommit: null, acceptedAt: null, reports: [] }, repo), []);
  });
});

import assert from "node:assert/strict";
import { it } from "node:test";
import { COMMON_DOCS, RUNTIME_MARKER, parseClient, validateCodexBundle, clientRuntime } from "./client-runtime.mjs";
import { deliverable } from "./deliver.mjs";
import { codexRunbookVersion, runbookVersion } from "./runbook.mjs";
import { hashOf, mergeClientLock } from "./manifest.mjs";
import { limitsFor } from "./entitlement.mjs";
import { stubOf } from "./template-boundary.mjs";

for (const plan of ["free", "pro", "max"]) for (const newline of ["\n", "\r\n"]) {
  it(`validates the exact delivered stub for malformed headings: ${plan}/${JSON.stringify(newline)}`, () => {
    const one = ["## step: start", RUNTIME_MARKER, "## step:start", "PRIVATE STEP", "next: done", ""].join(newline);
    const two = RUNTIME_MARKER + newline + one;
    const replace = body => rows.map(row => row.path === "agents/dev.md" ? { ...row, body } : row);
    assert.throws(() => validateCodexBundle(replace(two), plan), /protocol mismatch: agents\/dev\.md/);
    assert.throws(() => deliverable(replace(two), plan, "codex"), /protocol mismatch/);
    const result = JSON.parse(JSON.stringify(deliverable(replace(one), plan, "codex")));
    assert.equal(result.templates["agents/dev.md"], stubOf(one));
    assert.equal((result.templates["agents/dev.md"].match(/<!-- harness-runtime:[^>]+ -->/g) ?? []).length, 1);
    assert.doesNotMatch(result.templates["agents/dev.md"], /PRIVATE STEP|^## step:\S/m);
    assert.equal(result.templates["CODEX.runbook.md"], rows.find(row => row.path === "CODEX.runbook.md").body);
    assert.equal(result.templates["CLAUDE.runbook.md"], undefined);
    for (const role of ["pm", "feature-scout", "plan-verifier", "doc-auditor", "qa-verifier", "impl-verifier"]) {
      assert.equal(Object.hasOwn(result.templates, `agents/${role}.md`), limitsFor(plan).agents.includes(role));
    }
  });
}

const rows = [
  { path: "CLAUDE.runbook.md", body: "legacy\n" }, { path: "CODEX.runbook.md", body: RUNTIME_MARKER + "\nCodex\n" },
  ...COMMON_DOCS.map(path => ({ path, body: "shared\n" })),
  ...["dev", "pm", "feature-scout", "plan-verifier", "doc-auditor", "qa-verifier", "impl-verifier"].map(role => ({ path: `agents/${role}.md`, body: RUNTIME_MARKER + "\nStub\n## step:start\nPrivate\nnext: done\n" })),
];
it("keeps Claude default and rejects non-enum clients", () => {
  assert.equal(parseClient(undefined), "claude"); assert.equal(parseClient(null), "claude");
  for (const value of ["", "Codex", "routine", {}, true]) assert.throws(() => parseClient(value));
  assert.equal(clientRuntime("codex").runbook_path, "docs/harness/codex-runbook.md");
});
it("delivers only the chosen runbook, entitled stubs and Codex-only runtime echo", () => {
  const claude = deliverable(rows, "free"), codex = deliverable(rows, "free", "codex");
  assert.equal(claude.runtime, undefined); assert.ok(claude.templates["CLAUDE.runbook.md"]); assert.equal(claude.templates["CODEX.runbook.md"], undefined);
  assert.deepEqual(codex.runtime, { client: "codex", protocol: "harness-runtime-v1" });
  assert.equal(codex.templates["CLAUDE.runbook.md"], undefined); assert.equal(codex.templates["agents/plan-verifier.md"], undefined);
  assert.doesNotMatch(codex.templates["agents/dev.md"], /Private|## step:/);
});
it("requires complete entitled bundles and a single correct raw stub marker", () => {
  assert.ok(validateCodexBundle(rows, "max"));
  for (const path of ["CODEX.runbook.md", "agents/dev.md", "agents/pm.md", ...COMMON_DOCS]) assert.throws(() => validateCodexBundle(rows.filter(row => row.path !== path), "max"));
  for (const marker of ["", RUNTIME_MARKER + RUNTIME_MARKER, "<!-- harness-runtime:v2 -->"]) assert.throws(() => validateCodexBundle(rows.map(row => row.path === "agents/dev.md" ? { ...row, body: row.body.replace(RUNTIME_MARKER, marker) } : row), "max"));
});
it("normalizes only the new Codex hash, preserving legacy raw-hash semantics", () => {
  const lf = "one\ntwo\n", crlf = lf.replaceAll("\n", "\r\n");
  assert.notEqual(runbookVersion(lf), runbookVersion(crlf));
  assert.equal(runbookVersion(lf), runbookVersion(crlf.replaceAll("\r\n", "\n")));
  assert.equal(codexRunbookVersion(lf), codexRunbookVersion(crlf)); assert.notEqual(codexRunbookVersion(lf), codexRunbookVersion(lf + "edited"));
});
it("merges a v1 union lock while preserving foreign/client and skipped hashes", () => {
  const previous = { version: 1, files: { ".claude/agents/web-dev.md": { template: "claude", hash: "old" }, ".codex/agents/retired.toml": { template: "retired", hash: "old" }, "docs/harness/codex-foreign.md": { template: "foreign", hash: "safe" }, "docs/plans/README.md": { template: "shared", hash: "previous" } } };
  const targets = { ".codex/agents/web-dev.toml": { template: "dev", content: "new" }, "docs/plans/README.md": { template: "shared", content: "modified target" } };
  const lock = mergeClientLock(previous, targets, { write: [".codex/agents/web-dev.toml"], skipModified: ["docs/plans/README.md"] }, "codex");
  assert.deepEqual(lock.files[".claude/agents/web-dev.md"], previous.files[".claude/agents/web-dev.md"]);
  assert.equal(lock.files[".codex/agents/retired.toml"], undefined); assert.equal(lock.files["docs/harness/codex-foreign.md"].hash, "safe");
  assert.equal(lock.files["docs/plans/README.md"].hash, "previous"); assert.equal(lock.files[".codex/agents/web-dev.toml"].hash, hashOf("new"));
});

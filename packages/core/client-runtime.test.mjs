import assert from "node:assert/strict";
import { it } from "node:test";
import { COMMON_DOCS, RUNTIME_MARKER, parseClient, validateCodexBundle, clientRuntime } from "./client-runtime.mjs";
import { deliverable } from "./deliver.mjs";
import { codexRunbookVersion, runbookVersion } from "./runbook.mjs";
import { hashOf, mergeClientLock } from "./manifest.mjs";

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

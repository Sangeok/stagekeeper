import assert from "node:assert/strict";
import { it } from "node:test";
import { canonicalJson, normalizeTemplateRows, prepareTemplateRelease, installationFor, compatibleInstallation, selectTemplateLanguage } from "./release-manifest.mjs";
import { COMMON_DOCS } from "./codex-bundle.mjs";

const marker = "<!-- harness-runtime:harness-runtime-v1 -->";
const source = { kind: "git", repository: "Sangeok/harness-templates", commit: "a".repeat(40) };
const rows = [
  ...["CLAUDE.runbook.md", "CODEX.runbook.md"].map(path => ({ lang: "en", path, body: `${marker}\nRunbook\n` })),
  ...COMMON_DOCS.map(path => ({ lang: "en", path, body: "Document\n" })),
  ...["dev", "pm", "feature-scout", "doc-auditor", "plan-verifier", "qa-verifier", "impl-verifier"].map(role => ({ lang: "en", path: `agents/${role}.md`, body: `${marker}\nStub\n## step:start\nDo it\nnext: done\n` })),
];

it("canonical identities ignore input ordering and CRLF but preserve meaningful whitespace and interpretation", () => {
  assert.equal(canonicalJson({ b: 2, a: [1, null] }), '{"a":[1,null],"b":2}');
  const first = prepareTemplateRelease(rows, source);
  const reordered = prepareTemplateRelease([...rows].reverse().map(row => ({ ...row, body: row.body.replaceAll("\n", "\r\n") })), source);
  assert.equal(first.releaseIdentity, reordered.releaseIdentity);
  assert.notEqual(first.contentHash, prepareTemplateRelease(rows.map((row, i) => i ? row : { ...row, body: row.body + " " }), source).contentHash);
  assert.notEqual(first.releaseIdentity, prepareTemplateRelease(rows, { ...source, commit: "b".repeat(40) }).releaseIdentity);
  assert.throws(() => canonicalJson({ omitted: undefined }));
});

it("invalid paths, duplicate rows and incomplete languages cannot become releases", () => {
  assert.throws(() => normalizeTemplateRows([...rows, rows[0]]));
  assert.throws(() => normalizeTemplateRows([{ ...rows[0], path: "../private.md" }]));
  assert.throws(() => normalizeTemplateRows([{ ...rows[0], lang: "../../en" }]));
  assert.throws(() => prepareTemplateRelease(rows.slice(1), source));
  assert.throws(() => prepareTemplateRelease(rows, { ...source, repository: "unapproved/repo" }));
  assert.throws(() => prepareTemplateRelease([...rows, { ...rows[0], lang: "ko" }], source));
});

it("installation compatibility tracks delivered instructions and current plan without pinning to the active ID", () => {
  const release = prepareTemplateRelease(rows, source);
  const input = { releaseId: "r1", rows, language: "en", plan: "free", client: "claude", contractHash: release.contractHash };
  const first = installationFor(input);
  const privateChange = rows.map(row => ({ ...row, body: row.body.replace("Do it", "New private step") }));
  assert.equal(installationFor({ ...input, releaseId: "r2", rows: privateChange }).clientSurfaceHash, first.clientSurfaceHash);
  assert.ok(compatibleInstallation(first, installationFor({ ...input, releaseId: "r2" })));
  assert.equal(compatibleInstallation(first, installationFor({ ...input, plan: "max" })), false);
  assert.equal(compatibleInstallation(first, installationFor({ ...input, client: "codex" })), false);
  assert.notEqual(first.clientSurfaceHash, installationFor({ ...input, rows: rows.map(row => ({ ...row, body: row.body.replace("Stub", "Different public instruction") })) }).clientSurfaceHash);
  assert.throws(() => installationFor({ ...input, contractHash: "unknown" }));
});

it("language selection stays inside one release and refuses a missing fallback", () => {
  assert.equal(selectTemplateLanguage(["en", "ko"], "ko"), "ko");
  assert.equal(selectTemplateLanguage(["en"], "ko"), "en");
  assert.equal(selectTemplateLanguage(["ko"], "fr"), null);
});

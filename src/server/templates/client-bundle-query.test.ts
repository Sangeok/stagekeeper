import assert from "node:assert/strict";
import { it } from "node:test";
import { RUNTIME_MARKER } from "@harness/core/execution/client-runtime.mjs";
import { COMMON_DOCS } from "@harness/core/templates/codex-bundle.mjs";
import { readCodexBundle, checkCodexRunbook } from "./client-bundle-query";

const bundle = [
  { path: "CODEX.runbook.md", body: RUNTIME_MARKER + "\nSource\r\n" }, ...COMMON_DOCS.map(path => ({ path, body: "docs" })),
  ...["dev", "pm", "feature-scout", "plan-verifier", "doc-auditor", "qa-verifier", "impl-verifier"].map(role => ({ path: `agents/${role}.md`, body: `${RUNTIME_MARKER}\nStub\n## step:start\nDo it.\nnext: done\n` })),
];

it("accepts a single delivered stub marker and rejects two markers before a malformed heading", async () => {
  for (const plan of ["free", "pro", "max"] as const) for (const newline of ["\n", "\r\n"]) {
    const one = ["## step: start", RUNTIME_MARKER, "## step:start", "PRIVATE STEP", "next: done", ""].join(newline);
    const replace = (body: string) => bundle.map(row => row.path === "agents/dev.md" ? { ...row, body } : row);
    const accepted = await readCodexBundle(async () => replace(one), "en", plan, false);
    assert.ok(accepted.ok);
    const rejected = await readCodexBundle(async () => replace(RUNTIME_MARKER + newline + one), "en", plan, false);
    assert.equal(rejected.ok, false);
  }
});
it("MCP fallback selects the entire English bundle only if the localized Codex source is absent", async () => {
  const calls: string[] = [];
  const result = await readCodexBundle(async language => { calls.push(language); return language === "en" ? bundle : [{ path: "agents/dev.md", body: "localized partial" }]; }, "ko", "max", true);
  assert.ok(result.ok); assert.deepEqual(calls, ["ko", "en"]); assert.equal(result.item.language, "en"); assert.equal(checkCodexRunbook(result.item, result.item.version), null);
  assert.match(checkCodexRunbook(result.item, undefined)!, /required/); assert.match(checkCodexRunbook(result.item, "000000000000")!, /stale/);
});
it("REST never falls back; a localized source with missing roles also cannot mix languages", async () => {
  for (const fallback of [false, true]) {
    const calls: string[] = [];
    const result = await readCodexBundle(async language => { calls.push(language); return language === "en" ? bundle : bundle.filter(row => row.path !== "agents/dev.md"); }, "ko", "max", fallback);
    assert.equal(result.ok, false); assert.deepEqual(calls, ["ko"]);
  }
  assert.equal((await readCodexBundle(async language => language === "en" ? bundle : [], "ko", "max", false)).ok, false);
});
it("malformed entitled steps reject the whole bundle while out-of-plan rows stay irrelevant", async () => {
  const rows = bundle.map(row => row.path === "agents/plan-verifier.md" ? { ...row, body: `${RUNTIME_MARKER}\n## step:x\nBad\nnext: missing` } : row);
  assert.equal((await readCodexBundle(async () => rows, "en", "max", false)).ok, false);
  assert.equal((await readCodexBundle(async () => rows, "en", "free", false)).ok, true);
});

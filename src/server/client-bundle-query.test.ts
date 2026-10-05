import assert from "node:assert/strict";
import { it } from "node:test";
import { COMMON_DOCS, RUNTIME_MARKER } from "@harness/core/client-runtime.mjs";
import { readCodexBundle, checkCodexRunbook } from "./client-bundle-query";

const bundle = [
  { path: "CODEX.runbook.md", body: RUNTIME_MARKER + "\nSource\r\n" }, ...COMMON_DOCS.map(path => ({ path, body: "docs" })),
  ...["dev", "pm", "feature-scout", "plan-verifier", "doc-auditor", "qa-verifier"].map(role => ({ path: `agents/${role}.md`, body: `${RUNTIME_MARKER}\nStub\n## step:start\nDo it.\nnext: done\n` })),
];
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

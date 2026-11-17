import assert from "node:assert/strict";
import { it } from "node:test";
import { parseClient, clientRuntime } from "./client-runtime.mjs";

it("keeps Claude default and rejects non-enum clients", () => {
  assert.equal(parseClient(undefined), "claude"); assert.equal(parseClient(null), "claude");
  for (const value of ["", "Codex", "routine", {}, true]) assert.throws(() => parseClient(value));
  assert.equal(clientRuntime("codex").runbook_path, "docs/harness/codex-runbook.md");
});

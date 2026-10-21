import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { it } from "node:test";

import { PLUGIN_ID, PLUGIN_MARKETPLACE, installCommands } from "./plugin-install";

it("adds the public marketplace before installing the plugin it declares", () => {
  assert.deepEqual([...installCommands], [
    "claude plugin marketplace add Sangeok/stagekeeper",
    "claude plugin install harness@stagekeeper-local",
  ]);
  assert.match(PLUGIN_MARKETPLACE, /^[\w.-]+\/[\w.-]+$/);
  const manifest: unknown = JSON.parse(readFileSync(new URL("../../../../.claude-plugin/marketplace.json", import.meta.url), "utf8"));
  assert.ok(manifest && typeof manifest === "object" && "name" in manifest && "plugins" in manifest);
  assert.equal(typeof manifest.name, "string");
  assert.ok(Array.isArray(manifest.plugins));
  const plugin: unknown = manifest.plugins[0];
  assert.ok(plugin && typeof plugin === "object" && "name" in plugin && typeof plugin.name === "string");
  assert.equal(PLUGIN_ID, `${plugin.name}@${manifest.name}`);
});

import assert from "node:assert/strict";

import { it } from "node:test";

import { parseQaConfig } from "./config.mjs";

const config = { environment: "test", baseUrl: "http://127.0.0.1:3000", mcpUrl: "http://127.0.0.1:8931/mcp", scenariosPath: "docs/qa/scenarios.md" };

it("requires explicit test settings and refuses release origins and escaping scenario paths", () => {
  assert.equal(parseQaConfig(undefined), null);
  assert.deepEqual(parseQaConfig(config), config);
  for (const change of [{ environment: "production" }, { mcpUrl: "https://remote.example/mcp" }, { scenariosPath: "../secrets" }, { scenariosPath: "C:/secret" }, { baseUrl: "https://user:pass@test.example" }]) assert.throws(() => parseQaConfig({ ...config, ...change }));
  assert.throws(() => parseQaConfig(config, { baseUrl: config.baseUrl + "/production" }), /release origin/);
});

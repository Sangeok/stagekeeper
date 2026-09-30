import assert from "node:assert/strict";
import { it } from "node:test";
import { projectConnectionWritesEnabled } from "../../src/server/project-connection-config";

it("enables connection writes only for the exact server environment value true", () => {
  const previous = process.env.PROJECT_CONNECTION_WRITES_ENABLED;
  try {
    for (const value of [undefined, "false", "TRUE", " true", "1", "true"]) {
      if (value === undefined) delete process.env.PROJECT_CONNECTION_WRITES_ENABLED;
      else process.env.PROJECT_CONNECTION_WRITES_ENABLED = value;
      assert.equal(projectConnectionWritesEnabled(), value === "true");
    }
  } finally {
    if (previous === undefined) delete process.env.PROJECT_CONNECTION_WRITES_ENABLED;
    else process.env.PROJECT_CONNECTION_WRITES_ENABLED = previous;
  }
});

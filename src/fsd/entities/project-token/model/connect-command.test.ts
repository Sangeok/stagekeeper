import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { connectCommands } from "./connect-command";

describe("connectCommands", () => {
  it("gives one runnable line per shell, with the token inlined", () => {
    const commands = connectCommands("hs_abc");
    assert.deepEqual(commands.map((c) => c.kind), ["powershell", "posix"]);
    assert.equal(commands[0]?.command, '$env:HARNESS_TOKEN = "hs_abc"');
    assert.equal(commands[1]?.command, 'export HARNESS_TOKEN="hs_abc"');
  });

  it("names the variable the generator writes into .mcp.json", () => {
    for (const entry of connectCommands("hs_abc")) assert.match(entry.command, /HARNESS_TOKEN/);
  });
});

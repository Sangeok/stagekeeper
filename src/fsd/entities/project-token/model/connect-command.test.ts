import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { OWNER_TOKEN_VARIABLE, connectCommands } from "./connect-command";

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

  it("names the owner variable when asked, and keeps the agent variable by default", () => {
    const owner = connectCommands("ho_abc", OWNER_TOKEN_VARIABLE);
    assert.equal(owner[0]?.command, '$env:HARNESS_OWNER_TOKEN = "ho_abc"');
    assert.equal(owner[1]?.command, 'export HARNESS_OWNER_TOKEN="ho_abc"');
    for (const entry of connectCommands("hs_abc")) assert.match(entry.command, /HARNESS_TOKEN=|HARNESS_TOKEN =/);
  });
});

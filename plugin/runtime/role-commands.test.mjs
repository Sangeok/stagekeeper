import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { it } from "node:test";
import { createMacosCommands, macosCommandTool } from "./macos-commands.mjs";
import { createRoleCommands, ROLE_COMMAND_DEFAULT_TIMEOUT_MS, RoleCommandInputError, roleCommandTimeGuidance, roleCommandTool } from "./role-commands.mjs";

const unusedFiles = { tools: [], call: () => { throw new Error("file tools are not used"); }, close: () => {} };

it("states a 60000 ms default and the 100 through 300000 ms range the same way in both tool schemas, the role guidance and the Windows helper", () => {
  assert.equal(ROLE_COMMAND_DEFAULT_TIMEOUT_MS, 60000);
  for (const tool of [roleCommandTool, macosCommandTool]) {
    const { minimum, maximum, description } = tool.inputSchema.properties.timeoutMs;
    assert.deepEqual([minimum, maximum], [100, 300000]);
    assert.equal(description, roleCommandTimeGuidance);
  }
  assert.match(roleCommandTimeGuidance, /defaults to 60000 and may be 100\.\.300000\./);
  assert.match(roleCommandTimeGuidance, /only for a build or test run known to need it/);

  const helper = readFileSync(new URL("./windows/RoleProcess.cs", import.meta.url), "utf8");
  const bounds = [...helper.matchAll(/timeoutMs < (\d+) \|\| timeoutMs > (\d+)/g)].map(match => [Number(match[1]), Number(match[2])]);
  assert.deepEqual(bounds, [[100, 300000]]);
});

it("accepts 100 through 300000 ms and refuses any other command time on both backends before preparing a snapshot", async () => {
  const backends = [
    await createRoleCommands({ root: "", agent: "plan-verifier", runtime: {}, fileBroker: unusedFiles }),
    await createMacosCommands({ root: "", agent: "plan-verifier", runtime: {}, fileBroker: unusedFiles }),
  ];
  const stopped = AbortSignal.abort();
  try {
    for (const backend of backends) {
      for (const timeoutMs of [100, 300000]) {
        await assert.rejects(backend.call("role_command_exec", { command: "node check.cjs", timeoutMs }, stopped), { name: "AbortError" }, `timeoutMs ${timeoutMs}`);
      }
      for (const timeoutMs of [99, 300001, 1.5, "60000"]) {
        await assert.rejects(backend.call("role_command_exec", { command: "node check.cjs", timeoutMs }, stopped),
          error => error instanceof RoleCommandInputError && /100 through 300000/.test(error.message), `timeoutMs ${JSON.stringify(timeoutMs)}`);
      }
    }
  } finally {
    for (const backend of backends) await backend.close();
  }
});

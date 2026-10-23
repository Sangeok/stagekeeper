import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { TOKEN_KINDS } from "@harness/core/tokens/token.mjs";
import { OWNER_TOKEN_VARIABLE, codexMcpCommand, codexOwnerMcpCommand, connectCommands, profileLine, saveCommands, tokenKind } from "./connect-command";

describe("Codex owner connection", () => {
  it("registers the owner endpoint with an environment reference and preserves the agent command", () => {
    assert.equal(codexOwnerMcpCommand("https://fixture.test/api/mcp/owner"), "codex mcp add harness_owner --url 'https://fixture.test/api/mcp/owner' --bearer-token-env-var HARNESS_OWNER_TOKEN");
    assert.equal(codexMcpCommand("https://fixture.test/api/mcp"), "codex mcp add harness --url 'https://fixture.test/api/mcp' --bearer-token-env-var HARNESS_TOKEN");
  });

  it("quotes shell-sensitive URL paths without including credentials or query parameters", () => {
    assert.equal(codexOwnerMcpCommand("https://fixture.test/a'b/$value/`name"), "codex mcp add harness_owner --url 'https://fixture.test/a%27b/$value/%60name' --bearer-token-env-var HARNESS_OWNER_TOKEN");
    for (const url of ["file:///tmp/owner", "https://owner:secret@fixture.test/api/mcp/owner", "https://fixture.test/api/mcp/owner?token=secret", "https://fixture.test/api/mcp/owner#secret"]) {
      assert.throws(() => codexOwnerMcpCommand(url), /Invalid MCP URL/);
    }
  });
});

describe("connectCommands", () => {
  it("gives one runnable line per shell, with the token inlined", () => {
    const commands = connectCommands("hs_abc");
    assert.deepEqual(commands.map((c) => c.kind), ["powershell", "posix"]);
    assert.deepEqual(commands.map((c) => c.label), ["PowerShell", "bash / zsh"]);
    assert.equal(commands[0]?.command, '$env:HARNESS_TOKEN = "hs_abc"');
    assert.equal(commands[1]?.command, 'export HARNESS_TOKEN="hs_abc"');
  });

  it("names the variable the MCP registration references", () => {
    for (const entry of connectCommands("hs_abc")) assert.match(entry.command, /HARNESS_TOKEN/);
  });

  it("names the owner variable when asked, and keeps the agent variable by default", () => {
    const owner = connectCommands("ho_abc", OWNER_TOKEN_VARIABLE);
    assert.equal(owner[0]?.command, '$env:HARNESS_OWNER_TOKEN = "ho_abc"');
    assert.equal(owner[1]?.command, 'export HARNESS_OWNER_TOKEN="ho_abc"');
    for (const entry of connectCommands("hs_abc")) assert.match(entry.command, /HARNESS_TOKEN=|HARNESS_TOKEN =/);
  });
});

describe("tokenKind", () => {
  it("reads the kind off the prefix packages/core issues", () => {
    assert.equal(tokenKind(`${TOKEN_KINDS.user}abc`), "user");
    assert.equal(tokenKind(`${TOKEN_KINDS.agent}abc`), "project");
  });
});

describe("saveCommands", () => {
  it("gives one line per Windows shell that persists the variable and sets it in this shell too", () => {
    const commands = saveCommands();
    assert.deepEqual(commands.map((c) => c.kind), ["powershell", "gitbash"]);
    assert.ok(commands[0]!.command.includes('[Environment]::SetEnvironmentVariable("HARNESS_TOKEN", $p, "User")'));
    assert.ok(commands[0]!.command.endsWith("$env:HARNESS_TOKEN = $p"));
    assert.ok(commands[1]!.command.includes('setx HARNESS_TOKEN "$t"'));
    assert.ok(commands[1]!.command.includes('export HARNESS_TOKEN="$t"'));
  });

  it("asks for the token instead of carrying it", () => {
    const [powershell, gitbash] = saveCommands();
    assert.match(powershell!.command, /Read-Host "HARNESS_TOKEN" -AsSecureString/);
    assert.match(gitbash!.command, /^read -rsp /);
    assert.match(gitbash!.command, /; unset t$/);
    for (const entry of saveCommands()) assert.doesNotMatch(entry.command, /h[sou]_/);
  });

  it("gives the profile line for macOS and Linux, with the token inlined — it goes into a file, not a prompt", () => {
    assert.equal(profileLine("hu_abc"), 'export HARNESS_TOKEN="hu_abc"');
  });
});

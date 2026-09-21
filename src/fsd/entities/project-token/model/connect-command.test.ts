import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { TOKEN_KINDS } from "@harness/core/token.mjs";
import { OWNER_TOKEN_VARIABLE, PLUGIN_ID, PLUGIN_MARKETPLACE, connectCommands, installCommands, profileLine, saveCommands, tokenKind } from "./connect-command";

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

// 서버 주소를 셸로 옮기는 줄은 없앴다 — /harness:init이 HARNESS_SERVER를 직접 설정한다(product-copy.md §9).
describe("tokenKind", () => {
  // 화면은 접두로 종류를 읽는다. 접두의 출처는 packages/core/token.mjs 하나다 — 그 모듈은 node:crypto를 끌고 와서
  // 클라이언트 번들에 넣을 수 없으므로 여기서는 문자열로 다시 적고, 이 시험이 둘을 묶는다.
  it("reads the kind off the prefix packages/core issues", () => {
    assert.equal(tokenKind(`${TOKEN_KINDS.user}abc`), "user");
    assert.equal(tokenKind(`${TOKEN_KINDS.agent}abc`), "project");
  });
});

describe("saveCommands", () => {
  // hu_만 머신 전역에 저장한다. hs_는 저장소마다 값이 달라 두 번째 저장소가 첫 번째를 덮어쓴다.
  it("gives one line per Windows shell that persists the variable and sets it in this shell too", () => {
    const commands = saveCommands();
    assert.deepEqual(commands.map((c) => c.kind), ["powershell", "gitbash"]);
    assert.ok(commands[0]!.command.includes('[Environment]::SetEnvironmentVariable("HARNESS_TOKEN", $p, "User")'));
    assert.ok(commands[0]!.command.endsWith("$env:HARNESS_TOKEN = $p"));
    assert.ok(commands[1]!.command.includes('setx HARNESS_TOKEN "$t"'));
    assert.ok(commands[1]!.command.includes('export HARNESS_TOKEN="$t"'));
  });

  // 값을 싣지 않고 입력을 받는다 — 그래서 인자가 없다. 셸 히스토리에 남는 것은 이 줄뿐이다.
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

describe("installCommands", () => {
  // 순서가 전부다 — marketplace를 먼저 등록해야 그 이름으로 install이 해석된다.
  it("adds the marketplace before installing the plugin from it", () => {
    assert.deepEqual([...installCommands], [
      "claude plugin marketplace add Sangeok/stagekeeper",
      "claude plugin install harness@stagekeeper-local",
    ]);
  });

  // 설치 id는 마켓플레이스 매니페스트가 선언한 이름에서 파생된다. 매니페스트가 바뀌면 이 문구도 바뀌어야 한다.
  it("installs the plugin under the id the marketplace manifest declares", () => {
    const manifest = JSON.parse(
      readFileSync(new URL("../../../../../.claude-plugin/marketplace.json", import.meta.url), "utf8"),
    );
    assert.equal(PLUGIN_ID, `${manifest.plugins[0].name}@${manifest.name}`);
  });

  // source는 공개 저장소다 — 머신별 절대경로가 문구에 들어가면 다른 사람 화면에서 거짓이 된다.
  it("points at a public repository, not a machine-specific path", () => {
    assert.match(PLUGIN_MARKETPLACE, /^[\w.-]+\/[\w.-]+$/);
  });
});

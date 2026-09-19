import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { OWNER_TOKEN_VARIABLE, PLUGIN_ID, PLUGIN_MARKETPLACE, connectCommands, installCommands } from "./connect-command";

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

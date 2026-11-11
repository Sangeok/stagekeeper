import assert from "node:assert/strict";
import { it } from "node:test";
import { fileURLToPath } from "node:url";
import { clientVersion, environmentFields, measureEnvironment, osVersion, pluginVersionAt } from "./gate-environment.mjs";

it("reads the version from the first word of the client's version line", () => {
  assert.equal(clientVersion("2.1.322 (Claude Code)\n"), "2.1.322");
  assert.equal(clientVersion("  0.167.1"), "0.167.1");
  assert.equal(clientVersion("codex-cli 0.167.1"), undefined);
  assert.equal(clientVersion("2.1 (Claude Code)"), undefined);
  assert.equal(clientVersion(""), undefined);
  assert.equal(clientVersion(undefined), undefined);
});

it("reads the product version on macOS and the kernel release elsewhere", () => {
  const read = { product: () => "15.7.1\n", release: () => "10.0.20348" };
  assert.equal(osVersion("darwin", read), "15.7.1");
  assert.equal(osVersion("win32", read), "10.0.20348");
  assert.equal(osVersion("darwin", { ...read, product: () => "ProductVersion: 15.7.1" }), undefined);
  assert.equal(osVersion("win32", { ...read, release: () => "6.8.0-1017-azure" }), undefined);
  assert.equal(osVersion("darwin", { ...read, product: () => { throw new Error("sw_vers is missing"); } }), undefined);
});

it("measures the client and the system without failing when a command is missing", () => {
  const calls = [];
  const measured = measureEnvironment("darwin", (file, args) => {
    calls.push([file, ...args].join(" "));
    return file === "claude" ? "2.1.322 (Claude Code)" : "15.7.1";
  });
  assert.deepEqual(measured, { clientVersion: "2.1.322", osVersion: "15.7.1" });
  assert.deepEqual(calls, ["claude --version", "sw_vers -productVersion"]);

  const missing = measureEnvironment("darwin", () => { throw new Error("spawn ENOENT"); });
  assert.deepEqual(missing, { clientVersion: undefined, osVersion: undefined });
});

it("reads the plugin version from the installed manifest and nothing from a broken one", () => {
  const manifest = text => () => text;
  assert.equal(pluginVersionAt("/p", manifest('{"name":"harness","version":"0.6.14"}')), "0.6.14");
  assert.equal(pluginVersionAt("/p", manifest('{"version":"0.6.14-rc1"}')), undefined);
  assert.equal(pluginVersionAt("/p", manifest("not json")), undefined);
  assert.equal(pluginVersionAt("/p", () => { throw new Error("ENOENT"); }), undefined);
  assert.match(pluginVersionAt(fileURLToPath(new URL("../../plugin/", import.meta.url))), /^\d+\.\d+\.\d+$/);
});

it("keeps only well-formed environment values", () => {
  assert.deepEqual(
    environmentFields({ client: "claude", clientVersion: "2.1.322", pluginVersion: "0.6.14", osVersion: "10.0.20348", os: "win32-x64" }),
    { client: "claude", clientVersion: "2.1.322", pluginVersion: "0.6.14", osVersion: "10.0.20348" },
  );
  assert.deepEqual(
    environmentFields({ client: "@everyone", clientVersion: "2.1.322 (Claude Code)", pluginVersion: "0.6", osVersion: "15.7.1 beta", }),
    {},
  );
  assert.deepEqual(environmentFields({ clientVersion: 2, pluginVersion: null, osVersion: ["15.7.1"] }), {});
  assert.deepEqual(environmentFields(undefined), {});
});

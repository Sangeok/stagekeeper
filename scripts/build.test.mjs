import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, it } from "node:test";

const roots = [];

function project({ prismaExit = 0, nextExit = 0 } = {}) {
  const root = mkdtempSync(join(realpathSync(tmpdir()), "stagekeeper-build-cli-"));
  roots.push(root);
  mkdirSync(join(root, "scripts"));
  copyFileSync(new URL("./build.mjs", import.meta.url), join(root, "scripts/build.mjs"));
  for (const [file, step, code] of [["prisma/build/index.js", "prisma", prismaExit], ["next/dist/bin/next", "next", nextExit]]) {
    const target = join(root, "node_modules", file);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, `require("node:fs").appendFileSync("steps.log", JSON.stringify({step:${JSON.stringify(step)},args:process.argv.slice(2)}) + "\\n"); process.exit(${code});`);
  }
  return root;
}

function run(root, args = []) {
  return spawnSync(process.execPath, [join(root, "scripts/build.mjs"), ...args], {
    cwd: root,
    env: { ...process.env, STAGEKEEPER_ROLE_SNAPSHOT: "0" },
    encoding: "utf8",
  });
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

it("handles help and rejects unsupported arguments before generating or building", () => {
  const root = project();
  const help = run(root, ["--help"]);
  assert.equal(help.status, 0, help.stderr);
  assert.match(help.stdout, /Usage:/);
  assert.equal(existsSync(join(root, "steps.log")), false);
  for (const args of [["--unknown"], ["another-project"], ["--help", "--unknown"]]) {
    const result = run(root, args);
    assert.equal(result.status, 2, result.stderr);
    assert.match(result.stderr, /Usage:/);
    assert.equal(existsSync(join(root, "steps.log")), false);
  }
});

it("runs Prisma generation before the normal Next build", () => {
  const root = project();
  const result = run(root);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(readFileSync(join(root, "steps.log"), "utf8").trim().split("\n").map(line => JSON.parse(line)), [
    { step: "prisma", args: ["generate"] },
    { step: "next", args: ["build"] },
  ]);
});

it("preserves generation failure and does not start Next after it", () => {
  const root = project({ prismaExit: 17 });
  assert.equal(run(root).status, 17);
  assert.deepEqual(readFileSync(join(root, "steps.log"), "utf8").trim().split("\n").map(line => JSON.parse(line).step), ["prisma"]);
});

it("preserves a Next build failure", () => {
  const root = project({ nextExit: 23 });
  assert.equal(run(root).status, 23);
});

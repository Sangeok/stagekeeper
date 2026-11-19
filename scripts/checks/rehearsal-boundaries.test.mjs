import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { it } from "node:test";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { firstPartySources, isTestSource } from "../lib/shared-module-graph.mjs";

const repository = fileURLToPath(new URL("../../", import.meta.url));
const implementations = [
  "scripts/rehearsals/support/command-run.ts",
  "scripts/rehearsals/support/smoke-database.ts",
  "scripts/rehearsals/support/template-fixture.ts",
  "scripts/rehearsals/support/repository-fixture.ts",
  "scripts/rehearsals/support/repository-root.mjs",
  "scripts/rehearsals/client-init/options.ts",
  "scripts/rehearsals/client-init/claude-connection.ts",
];
const rehearsals = "scripts/rehearsals/";
const record = ".github/actions/gate-record/record.mjs";
const moved = [
  "client-init/client-init-smoke-steps.mjs", "pipeline/pipeline-smoke-steps.mjs",
  "agent-eval/codex-init-eval.mjs", "agent-eval/agent-eval-summary.mjs",
  "support/gate-environment.mjs", "support/smoke-server.mjs", "support/smoke-server-listener.cjs",
].map(file => rehearsals + file);
const adapters = new Map(moved.map(file => [rehearsals + path.posix.basename(file), file]));
adapters.set(rehearsals + "gate-record.mjs", record);
const verificationFiles = [
  "scripts/rehearsals/support/command-run.test.ts",
  "scripts/rehearsals/client-init/claude-connection.test.ts",
  "scripts/rehearsals/rehearsal-compatibility.test.mjs",
  "scripts/checks/rehearsal-boundaries.test.mjs",
];
const consumers = [
  "scripts/rehearsals/rehearse-pipeline-smoke.ts",
  "scripts/rehearsals/rehearse-codex-macos.mjs",
  "scripts/rehearsals/rehearse-shared-distribution.mjs",
  "tests/server/integration/script-database.test.ts",
];
const legacy = "scripts/rehearsals/rehearse-client-init-smoke";
const read = file => readFileSync(path.join(repository, file), "utf8");

function parse(file) {
  return ts.createSourceFile(file, read(file), ts.ScriptTarget.Latest, true);
}

function visit(source, accept) {
  const matches = [];
  function walk(node) {
    if (accept(node)) matches.push(node);
    ts.forEachChild(node, walk);
  }
  walk(source);
  return matches;
}

function references(source) {
  return visit(source, node =>
    (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier
      && ts.isStringLiteralLike(node.moduleSpecifier)
      || ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword || ts.isIdentifier(node.expression) && node.expression.text === "require")
      && node.arguments.length === 1 && ts.isStringLiteralLike(node.arguments[0]))
    .map(node => ts.isCallExpression(node) ? node.arguments[0].text : node.moduleSpecifier.text);
}

function resolved(owner, specifier) {
  if (!specifier.startsWith(".")) return null;
  return path.posix.normalize(path.posix.join(path.posix.dirname(owner), specifier));
}

function eventPaths(text, event) {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const on = lines.indexOf("on:");
  assert.notEqual(on, -1);
  const onEnd = lines.findIndex((line, index) => index > on && /^\S/.test(line));
  const events = lines.slice(on + 1, onEnd < 0 ? undefined : onEnd);
  const start = events.findIndex(line => line === "  " + event + ":");
  assert.notEqual(start, -1, event);
  const end = events.findIndex((line, index) => index > start && /^ {2}\S/.test(line));
  const block = events.slice(start + 1, end < 0 ? undefined : end);
  const paths = block.indexOf("    paths:");
  if (paths < 0) return null;
  const values = [];
  for (const line of block.slice(paths + 1)) {
    if (!line.trim() || line.trimStart().startsWith("#")) continue;
    if (/^ {4}\S/.test(line)) break;
    const match = /^ {6}- (.+)$/.exec(line);
    assert.ok(match, "Unsupported paths line " + line);
    const value = match[1].trim();
    values.push(value.startsWith('"') ? JSON.parse(value)
      : value.startsWith("'") ? value.slice(1, -1) : value);
  }
  assert.ok(values.length > 0);
  return values;
}

function selected(patterns, file) {
  if (patterns === null) return true;
  let included = false;
  for (const entry of patterns) {
    const excluded = entry.startsWith("!");
    if (path.posix.matchesGlob(file, excluded ? entry.slice(1) : entry)) included = !excluded;
  }
  return included;
}

it("keeps extracted modules and current consumers off the legacy CLI implementation", () => {
  const graph = new Map();
  const modules = [...implementations, ...moved, record];
  for (const file of [...modules, ...consumers, rehearsals + "rehearse-client-init-smoke.ts", rehearsals + "open-pipeline-transcripts.mjs"]) {
    const refs = references(parse(file)).map(ref => resolved(file, ref)).filter(Boolean);
    assert.ok(refs.every(ref => ref.replace(/\.(?:ts|mjs)$/, "") !== legacy), file);
    for (const ref of refs) assert.ok(!adapters.has(ref), file + " imports adapter " + ref);
    if (!modules.includes(file)) continue;
    assert.ok(refs.every(ref => !ref.startsWith(".github/") && !ref.startsWith("tests/") && !/\.test\./.test(ref)), file);
    if (file.includes("/support/")) assert.ok(refs.every(ref => !ref.includes("/client-init/")), file);
    graph.set(file, refs.flatMap(ref => modules.filter(target =>
      target === ref || target.replace(/\.(?:ts|mjs)$/, "") === ref)));
  }
  for (const [adapter, target] of adapters) {
    const local = references(parse(adapter)).map(ref => resolved(adapter, ref)).filter(Boolean);
    assert.deepEqual([...new Set(local)], [target], adapter);
  }
  assert.deepEqual(graph.get(record).sort(), [
    rehearsals + "agent-eval/agent-eval-summary.mjs", rehearsals + "client-init/client-init-smoke-steps.mjs",
    rehearsals + "pipeline/pipeline-smoke-steps.mjs",
  ]);
  function walk(file, ancestors) {
    assert.ok(!ancestors.includes(file), [...ancestors, file].join(" -> "));
    for (const target of graph.get(file) ?? []) walk(target, [...ancestors, file]);
  }
  for (const file of modules) walk(file, []);
});

it("preserves only the previous checkout seed import in shared distribution acceptance", () => {
  const source = parse("scripts/rehearsals/rehearse-shared-distribution.mjs");
  const calls = visit(source, node => ts.isCallExpression(node) && ts.isIdentifier(node.expression)
    && node.expression.text === "command" && ts.isStringLiteralLike(node.arguments[0])
    && node.arguments[0].text === "previous-seed");
  assert.equal(calls.length, 1);
  const args = calls[0].arguments[2], settings = calls[0].arguments[3];
  assert.ok(ts.isArrayLiteralExpression(args) && ts.isObjectLiteralExpression(settings));
  const marker = args.elements.findIndex(node => ts.isStringLiteralLike(node) && node.text === "-e");
  assert.ok(marker >= 0 && ts.isIdentifier(args.elements[marker + 1]));
  const seedName = args.elements[marker + 1].text;
  const declarations = visit(source, node => ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)
    && node.name.text === seedName);
  assert.equal(declarations.length, 1);
  assert.ok(ts.isStringLiteralLike(declarations[0].initializer));
  const seed = ts.createSourceFile("previous-seed.mjs", declarations[0].initializer.text, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  assert.deepEqual(references(seed), ["./scripts/rehearsals/rehearse-client-init-smoke.ts"]);
  const cwd = settings.properties.find(node => ts.isPropertyAssignment(node) && node.name.getText(source) === "cwd");
  assert.ok(cwd && ts.isPropertyAccessExpression(cwd.initializer));
  assert.equal(cwd.initializer.name.text, "previous");
});

it("selects every CVO1 implementation and test in the three existing PR gates", () => {
  for (const name of ["client-init-smoke", "windows-role-runtime", "macos-runtime-contracts"]) {
    const paths = eventPaths(read(".github/workflows/" + name + ".yml"), "pull_request");
    assert.notEqual(paths, null);
    for (const file of [...implementations, ...verificationFiles]) assert.equal(selected(paths, file), true, name + ": " + file);
    assert.equal(selected(paths, "docs/proposals/active/unrelated.md"), false);
  }
});

it("selects shared distribution consumers on PRs without expanding its push or Claude-only selection", () => {
  const workflow = read(".github/workflows/shared-distribution-acceptance.yml");
  const pull = eventPaths(workflow, "pull_request"), push = eventPaths(workflow, "push");
  assert.notEqual(pull, null);
  assert.notEqual(push, null);
  for (const file of [...implementations, ...verificationFiles]) {
    const needed = file.includes("/support/") || file.endsWith("/rehearsal-compatibility.test.mjs")
      || file.endsWith("/rehearsal-boundaries.test.mjs");
    assert.equal(selected(pull, file), needed, "pull_request: " + file);
    assert.equal(selected(push, file), false, "push: " + file);
  }
  assert.equal(selected(pull, "scripts/rehearsals/rehearse-client-init-smoke.ts"), true);
  assert.equal(selected(push, "scripts/rehearsals/rehearse-client-init-smoke.ts"), false);
});

it("distinguishes event blocks and rejects unsupported path syntax", () => {
  const text = "on:\n  pull_request:\n    paths:\n      - 'scripts/**'\n      - '!scripts/private/**'\n  push:\n    branches: [dev]\njobs:\n";
  const pull = eventPaths(text, "pull_request");
  assert.equal(selected(pull, "scripts/example.mjs"), true);
  assert.equal(selected(pull, "scripts/private/example.mjs"), false);
  assert.equal(eventPaths(text, "push"), null);
  assert.throws(() => eventPaths(text.replace("      - 'scripts/**'", "      include: scripts/**"), "pull_request"), /Unsupported/);
});

function verificationImports(file, source) {
  return references(source).map(ref => resolved(file, ref) ?? ref)
    .filter(target => target.startsWith(rehearsals) || target.startsWith(".github/actions/gate-record/"));
}

it("keeps production modules independent of rehearsals and CI recording", () => {
  const probe = "src/server/public-url.ts";
  const forbidden = "../../scripts/rehearsals/support/gate-environment.mjs";
  const fixture = ts.createSourceFile(probe, 'import "' + forbidden + '";', ts.ScriptTarget.Latest);
  assert.deepEqual(verificationImports(probe, fixture), [rehearsals + "support/gate-environment.mjs"]);
  const sources = firstPartySources(repository, ["src", "packages/shared", "packages/app-core", "plugin/bin", "plugin/runtime"]);
  for (const file of sources.filter(file => !isTestSource(file))) {
    assert.deepEqual(verificationImports(file, parse(file)), [], file);
  }
});

it("resolves the packaged preflight's AppServer from the eval implementation", async () => {
  const file = rehearsals + "agent-eval/codex-init-eval.mjs";
  const preflight = parse(file).statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === "preflightInitEval");
  assert.ok(preflight);
  const [target] = references(preflight).map(ref => resolved(file, ref));
  assert.equal(target, "plugin/runtime/codex-thread.mjs");
  assert.equal(typeof (await import(new URL("../../" + target, import.meta.url))).AppServer, "function");
});

it("selects the moved implementations and paired tests for the appropriate PR and dev push checks", () => {
  const install = "client-init-smoke", windows = "windows-role-runtime", mac = "macos-runtime-contracts", shared = "shared-distribution-acceptance";
  const native = [windows, mac], all = [install, ...native, shared];
  const gates = new Map(all.map(name => [name, read(".github/workflows/" + name + ".yml")]));
  const cases = [
    [rehearsals + "client-init/client-init-smoke-steps.mjs", [install, ...native]],
    [rehearsals + "pipeline/pipeline-smoke-steps.mjs", []],
    [rehearsals + "agent-eval/codex-init-eval.mjs", [install]],
    [rehearsals + "agent-eval/agent-eval-summary.mjs", []],
    [rehearsals + "support/gate-environment.mjs", all],
    [rehearsals + "support/smoke-server.mjs", all],
    [record, [install]],
  ];
  const paths = cases.flatMap(([file, checks]) => [[file, checks], [file.replace(".mjs", ".test.mjs"), checks]]);
  paths.push(
    [rehearsals + "agent-eval/stagekeeper-eval-dry-run", [install]],
    [rehearsals + "support/smoke-server-listener.cjs", all], [".github/actions/gate-record/action.yml", [install]],
    [rehearsals + "smoke-server.mjs", all], [rehearsals + "smoke-server-listener.cjs", all],
    [rehearsals + "client-init-smoke-steps.mjs", [install]], [rehearsals + "gate-environment.mjs", [install]],
    [rehearsals + "gate-record.mjs", [install]], [rehearsals + "codex-init-eval.mjs", [install]],
    [rehearsals + "agent-eval-summary.mjs", []], [rehearsals + "pipeline-smoke-steps.mjs", []],
  );
  for (const name of ["role-command-execution", "role-files", "role-git"]) paths.push(["plugin/runtime/" + name + ".test.mjs", all]);
  for (const [file, checks] of paths) {
    for (const [name, workflow] of gates) {
      assert.equal(selected(eventPaths(workflow, "pull_request"), file), checks.includes(name), name + ": " + file);
      if (name !== install) assert.equal(selected(eventPaths(workflow, "push"), file),
        native.includes(name) || file.startsWith("plugin/runtime/"), name + " push: " + file);
    }
  }
});

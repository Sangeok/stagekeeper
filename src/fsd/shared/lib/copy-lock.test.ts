import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { copyLock, lockUnits, missingUnits, visibleText } from "./copy-lock";

const DOC = [
  "prose before",
  "<!-- copy-lock:sample -->",
  "> **1. Do the thing**",
  "> Run `tool --flag` first. It can't fail.",
  "> PowerShell `$env:X = \"v\"` · bash / zsh `export X=\"v\"` — **Copy** / \"Copied\"",
  ">",
  "<!-- /copy-lock -->",
  "prose after",
].join("\r\n");

describe("copy-lock", () => {
  it("reads a block as one unit per line, split on the dot, with the formatting removed", () => {
    assert.deepEqual(copyLock("sample", DOC), [
      "1. Do the thing",
      "Run tool --flag first. It can't fail.",
      'PowerShell $env:X = "v"',
      'bash / zsh export X="v"',
    ]);
  });

  it("refuses a missing, unclosed or empty block instead of passing on nothing", () => {
    assert.throws(() => copyLock("absent", DOC), /no copy-lock block "absent"/);
    assert.throws(() => copyLock("open", "<!-- copy-lock:open -->\n> text"), /not closed/);
    assert.throws(() => copyLock("bare", "<!-- copy-lock:bare -->\n>\n<!-- /copy-lock -->"), /is empty/);
  });

  it("matches across element boundaries and React's escaping", () => {
    const html = "<p><b>1. Do the thing</b></p><p>Run <code>tool --flag</code> first. It can&#x27;t fail.</p>"
      + "<span>PowerShell</span><pre>$env:X = &quot;v&quot;</pre><span>bash / zsh</span><pre>export X=&quot;v&quot;</pre>";
    assert.equal(visibleText("<i>a &amp; b &lt;c&gt;</i>"), "a & b <c>");
    assert.deepEqual(missingUnits(copyLock("sample", DOC), html), []);
  });

  it("names the units the screen lacks — a reworded sentence is a miss", () => {
    const html = "<p>1. Do the thing</p><p>Run tool first.</p>";
    assert.deepEqual(missingUnits(lockUnits("> 1. Do the thing\n> Run `tool --flag` first."), html), ["Run tool --flag first."]);
  });
});

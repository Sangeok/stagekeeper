import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { DONE, REQUIREMENTS, TemplateFormatError, findStep, splitTemplate } from "./steps";

const STUB = `---
name: pm
tools: backlog_list, mcp__harness__agent_next
---

# pm

You are the pm. Call \`agent_next\` and do what it says.
`;

const TWO = `${STUB}
## step:start
Read the board.
next: pick

## step:pick   requires: can-propose
Pick one.
next: done
on failed: start
on blocked: start
`;

const fails = (body: string, re: RegExp) =>
  assert.throws(() => splitTemplate(body), (e: unknown) => e instanceof TemplateFormatError && re.test((e as Error).message));

describe("splitTemplate", () => {
  it("a body without steps is all stub", () => {
    const runbook = "# Runbook\n\nNo steps here.\n";
    assert.deepEqual(splitTemplate(runbook), { stub: runbook, steps: [] });
  });

  it("stub ends before the first heading and keeps the frontmatter", () => {
    const { stub } = splitTemplate(TWO);
    assert.equal(stub, STUB);
    assert.match(stub, /^---\nname: pm/);
    assert.doesNotMatch(stub, /## step:/);
  });

  it("steps keep order, id, requires, body and the three branches", () => {
    const { steps } = splitTemplate(TWO);
    assert.deepEqual(steps.map((s) => s.id), ["start", "pick"]);
    assert.deepEqual(steps[0], { id: "start", requires: [], body: "Read the board.", next: ["pick"], onFailed: undefined, onBlocked: undefined });
    assert.deepEqual(steps[1], { id: "pick", requires: ["can-propose"], body: "Pick one.", next: [DONE], onFailed: "start", onBlocked: "start" });
    assert.deepEqual(findStep(splitTemplate(TWO), "pick")?.next, ["done"]);
    assert.equal(findStep(splitTemplate(TWO), "nope"), undefined);
  });

  it("requires: accepts board statuses and derived conditions, comma separated", () => {
    const { steps } = splitTemplate(`${STUB}\n## step:s requires: implementing, verify-ok\nbody\nnext: done\n`);
    assert.deepEqual(steps[0].requires, ["implementing", "verify-ok"]);
    assert.ok(REQUIREMENTS.includes("in_review") && REQUIREMENTS.includes("can-propose"));
  });

  it("next: may list candidates — the server takes the first whose requires hold", () => {
    const body = `${STUB}\n## step:start\nRead the item.\nnext: implement | plan\n## step:plan requires: planning\nbody\nnext: done\n## step:implement requires: implementing\nbody\nnext: done\n`;
    assert.deepEqual(splitTemplate(body).steps[0].next, ["implement", "plan"]);
    fails(`${STUB}\n## step:s\nbody\nnext: done |\n`, /empty candidate/);
    fails(`${STUB}\n## step:s\nbody\nnext: done | gone\n`, /unknown step "gone"/);
  });

  it("headings and directives inside a code fence are body text", () => {
    const body = `${STUB}\n## step:s\nShow this:\n\`\`\`md\n## step:fake\nnext: fake\n\`\`\`\nnext: done\n`;
    const { steps } = splitTemplate(body);
    assert.equal(steps.length, 1);
    assert.match(steps[0].body, /## step:fake\nnext: fake/);
    assert.deepEqual(steps[0].next, ["done"]);
  });

  it("body lines that merely contain a colon are not directives", () => {
    const { steps } = splitTemplate(`${STUB}\n## step:s\nNote: keep going.\n- next: is a word here? no — only at column 0\nnext: done\n`);
    assert.match(steps[0].body, /Note: keep going/);
    assert.match(steps[0].body, /- next: is a word/);
  });

  it("rejects a step without next:", () => fails(`${STUB}\n## step:s\nbody\n`, /"s": missing next:/));
  it("rejects an empty body", () => fails(`${STUB}\n## step:s\nnext: done\n`, /"s": empty body/));
  it("rejects next: given twice", () => fails(`${STUB}\n## step:s\nbody\nnext: done\nnext: s\n`, /next: given twice/));
  it("rejects a reference to an unknown step", () => fails(`${STUB}\n## step:s\nbody\nnext: gone\n`, /unknown step "gone"/));
  it("rejects a duplicate id", () => fails(`${STUB}\n## step:s\nbody\nnext: done\n## step:s\nbody\nnext: done\n`, /duplicate step id "s"/));
  it("rejects done as an id and ids that are not kebab-case", () => {
    fails(`${STUB}\n## step:done\nbody\nnext: done\n`, /bad step id "done"/);
    fails(`${STUB}\n## step:Start\nbody\nnext: done\n`, /bad step id "Start"/);
  });
  it("rejects an unknown requirement and stray heading text", () => {
    fails(`${STUB}\n## step:s requires: approved\nbody\nnext: done\n`, /unknown requirement "approved"/);
    fails(`${STUB}\n## step:s (first)\nbody\nnext: done\n`, /unexpected text after id/);
  });
  it("rejects an unknown directive", () => fails(`${STUB}\n## step:s\nbody\non timeout: s\nnext: done\n`, /unknown directive "on timeout:"/));
});

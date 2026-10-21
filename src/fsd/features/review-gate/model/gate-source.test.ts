import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import ts from "typescript";
import * as transitions from "@harness/core/transitions.mjs";
import { STATUSES, findRule, type RuleKind } from "@harness/core/transitions.mjs";
import { needsHumanDecision, pendingInboxCount, reopenTargetsFor } from "./gate-source";

const DECLARED: Record<RuleKind, true> = { gate: true, auto: true, bounce: true, hold: true, resume: true, plan: true, reopen: true };

describe("RuleKind", () => {
  it("declares every runtime export without inventing another public value", () => {
    const source = ts.createSourceFile("transitions.d.mts", readFileSync("packages/core/transitions.d.mts", "utf8"), ts.ScriptTarget.Latest, true);
    const names = source.statements.flatMap(node => {
      if (!ts.canHaveModifiers(node) || !ts.getModifiers(node)?.some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword)) return [];
      if (ts.isFunctionDeclaration(node) && node.name) return [node.name.text];
      if (ts.isVariableStatement(node)) return node.declarationList.declarations.flatMap(declaration => ts.isIdentifier(declaration.name) ? [declaration.name.text] : []);
      return [];
    });
    assert.ok(names.length > 0, "runtime declarations must not be empty");
    assert.deepEqual(names.sort(), Object.keys(transitions).sort());
  });
  it("covers every kind the state machine actually produces", () => {
    const seen = new Set<string>();
    for (const actor of ["human", "agent", "pipeline"]) {
      for (const from of STATUSES) {
        for (const to of STATUSES) {
          const kind = findRule(actor, from, to)?.kind;
          if (typeof kind === "string") seen.add(kind);
        }
      }
    }
    assert.ok(seen.size > 0, "state machine produced no rules — the walk is wrong, not the union");
    assert.deepEqual([...seen].sort(), Object.keys(DECLARED).sort());
  });
});

describe("reopenTargetsFor", () => {
  it("done reopens to planning or implementing; nothing else reopens; done is still not an inbox card", () => {
    assert.deepEqual(reopenTargetsFor("done"), ["planning", "implementing"]);
    for (const s of ["proposed", "planning", "in_review", "implementing", "on_hold"]) assert.deepEqual(reopenTargetsFor(s), [], s);
    assert.equal(needsHumanDecision({ status: "done", gate: null }), false);
  });
});

describe("pendingInboxCount", () => {
  it("counts the same rows the inbox list renders", () => {
    const rows = [
      { status: "proposed", gate: "before-plan" },
      { status: "in_review", gate: "before-implement" },
      { status: "planning", gate: null },
      { status: "done", gate: null },
    ];
    assert.equal(pendingInboxCount(rows), rows.filter(needsHumanDecision).length);
  });

  it("a gate the graph removed is not a card, whatever the status says", () => {
    assert.equal(needsHumanDecision({ status: "proposed", gate: null }), false);
    assert.equal(needsHumanDecision({ status: "proposed", gate: "before-plan" }), true);
    assert.equal(needsHumanDecision({ status: "in_review", gate: "before-verify" }), true);
  });

  it("counts a resumable on_hold item that never owns the banner", () => {
    assert.equal(needsHumanDecision({ status: "on_hold", gate: null }), true);
    assert.equal(pendingInboxCount([{ status: "on_hold", gate: null }]), 1);
  });

  it("is zero when nothing waits on a person", () => {
    assert.equal(pendingInboxCount([{ status: "planning", gate: null }, { status: "implementing", gate: null }, { status: "done", gate: null }]), 0);
    assert.equal(pendingInboxCount([]), 0);
  });
});

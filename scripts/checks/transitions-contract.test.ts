import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import ts from "typescript";
import * as transitions from "@harness/core/pipeline/transitions.mjs";
import { STATUSES, findRule, type RuleKind } from "@harness/core/pipeline/transitions.mjs";

const DECLARED: Record<RuleKind, true> = { gate: true, auto: true, bounce: true, hold: true, resume: true, plan: true, reopen: true };

describe("RuleKind", () => {
  it("declares every runtime export without inventing another public value", () => {
    const source = ts.createSourceFile("transitions.d.mts", readFileSync("packages/core/pipeline/transitions.d.mts", "utf8"), ts.ScriptTarget.Latest, true);
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

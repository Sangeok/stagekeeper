import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderTemplate } from "./render.mjs";

describe("renderTemplate", () => {
  it("substitutes nested paths and repeats", () =>
    assert.equal(renderTemplate("{{ws.agent}} of {{project.name}} / {{ws.agent}}", { ws: { agent: "web-dev" }, project: { name: "ApcH" } }), "web-dev of ApcH / web-dev"));
  it("tolerates spaces inside braces", () => assert.equal(renderTemplate("{{ a }}", { a: 1 }), "1"));
  it("throws on missing var with its name", () => assert.throws(() => renderTemplate("{{nope}}", {}), /nope/));
  it("leaves non-template braces alone", () => assert.equal(renderTemplate("{ not } {{a}}", { a: "x" }), "{ not } x"));
});

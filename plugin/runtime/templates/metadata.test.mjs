import assert from "node:assert/strict";

import { it } from "node:test";

import { buildReportTable, templateDescription } from "./metadata.mjs";

it("report table has one row per delivered agent, in order, with that agent's own description", () => {
    const table = buildReportTable([{ name: "pm", description: "Picks work." }, { name: "feature-scout", description: "Researches." }]);
    assert.equal(table, "| agent | does |\n| --- | --- |\n| `pm` | Picks work. |\n| `feature-scout` | Researches. |");
    assert.equal(buildReportTable([]), "none");
  });

it("templateDescription reads the frontmatter line and refuses a template without one", () => {
    assert.equal(templateDescription("---\nname: pm\ndescription: Picks work. Never reads code.\ntools: x\n---\n# Role\n", "en/agents/pm.md"), "Picks work. Never reads code.");
    assert.equal(templateDescription("---\r\nname: pm\r\ndescription: Picks work.\r\n---\r\n", "pm"), "Picks work.");
    assert.throws(() => templateDescription("---\nname: pm\n---\ndescription: not here\n", "en/agents/pm.md"), /^Error: en\/agents\/pm\.md: no description in frontmatter$/);
  });

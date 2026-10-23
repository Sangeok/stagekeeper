import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, sep } from "node:path";
import { test } from "node:test";
import { inspectDocs, parseFrontMatter, relativeLinks } from "./verify-docs.mjs";

const completed = {
  status: "'completed'", stage: "null", result: "'pass'", "report-kind": "'regression'", "report-size": "'compact'",
  "test-levels": "['static', 'manual']", "test-tools": "['node --test']", "created-at": "'2026-10-01'", "completed-at": "'2026-10-02'",
  "last-executed-at": "'2026-10-02'", "tested-revision": "'abc1234'", owners: "['user:example']", related: "['docs/a.md']",
  "primary-area": "'docs/check'", "observed-environments": "['local | cli | node | owner']", "test-summary": "'pass: docs — ok'", "follow-up": "[]",
};
const active = { ...completed, status: "'active'", stage: "'running'", result: "null", "completed-at": "null" };
const front = (fields, body = "# Report\n") => `---\n${Object.entries(fields).map(([key, value]) => `${key}: ${value}`).join("\n")}\n---\n\n${body}`;

function inspect(files) {
  const parent = realpathSync(tmpdir()), root = mkdtempSync(join(parent, "stagekeeper-docs-check-"));
  try {
    for (const [file, body] of Object.entries(files)) {
      mkdirSync(dirname(join(root, file)), { recursive: true });
      writeFileSync(join(root, file), body);
    }
    return inspectDocs(root, Object.keys(files));
  } finally {
    assert.ok(root.startsWith(parent + sep));
    rmSync(root, { recursive: true, force: true });
  }
}

test("parses the flat front matter subset and refuses other shapes", () => {
  assert.deepEqual(parseFrontMatter("---\r\nstatus: 'it''s'\r\nstage: null\r\nowners: [\"user:a\", 'team:b']\r\nrelated:\r\n  - 'docs/a.md'\r\nfollow-up:\r\n---\r\n"), { status: "it's", stage: null, owners: ["user:a", "team:b"], related: ["docs/a.md"], "follow-up": null });
  assert.equal(parseFrontMatter("# No front matter\n"), null);
  assert.throws(() => parseFrontMatter("---\nstatus: 'a'\nstatus: 'b'\n---\n"), /duplicate key/);
  assert.throws(() => parseFrontMatter("---\nnested:\n  key: value\n---\n"), /unsupported line/);
  assert.throws(() => parseFrontMatter("---\nowners: ['a',]\n---\n"), /invalid list/);
});

test("finds relative links outside code and skips external links and anchors", () => {
  const text = "[a](./a.md) [b](<../b c.md> \"title\") [c](https://example.com) [d](#top) [e](src/app/(app)/page.tsx#L2)\n`[f](./f.md)`\n```md\n[g](./g.md)\n```\n[h]: ./h.md\n";
  assert.deepEqual(relativeLinks(text), ["./a.md", "../b c.md", "src/app/(app)/page.tsx#L2", "./h.md"]);
});

test("accepts conforming reports and tracked link targets", () => {
  const result = inspect({
    "docs/a.md": "[report](test-reports/completed/2026-10-02-check.md) [dir](./test-reports/) [root](/README.md) [encoded](./b%20c.md#part)\n",
    "docs/b c.md": "",
    "README.md": "[docs](docs/a.md)\n",
    "docs/test-reports/completed/2026-10-02-check.md": front(completed, "[back](../../a.md)\n"),
    "docs/test-reports/active/check.md": front(active),
  });
  assert.deepEqual(result.problems, []);
  assert.equal(result.reports, 2);
  assert.equal(result.links, 6);
});

test("reports lifecycle, enum, date and related violations", () => {
  const { problems } = inspect({
    "docs/a.md": "",
    "docs/test-reports/completed/2026-10-03-wrong.md": front({ ...completed, stage: "'complete'", result: "'passed'", "test-levels": "['unit']", "report-size": "'large'", related: "['docs/missing.md', 'notes.txt']" }),
    "docs/test-reports/active/open.md": front({ ...active, status: "'incomplete'", stage: "'done'", result: "'pass'", "completed-at": "'2026-10-02'" }),
    "docs/test-reports/completed/no-date.md": front({ ...completed, owners: "'user:example'" }),
    "docs/test-reports/active/bare.md": "# Bare\n",
    "docs/test-reports/active/partial.md": front({ status: "'active'", stage: "'planned'" }),
  });
  const expected = [
    "2026-10-03-wrong.md: stage must be null when completed",
    "2026-10-03-wrong.md: result must be one of pass, fail, blocked when completed",
    "2026-10-03-wrong.md: completed-at must be the YYYY-MM-DD date that starts the file name",
    "2026-10-03-wrong.md: report-size must be one of compact, standard",
    "2026-10-03-wrong.md: test-levels value \"unit\"",
    "2026-10-03-wrong.md: related \"docs/missing.md\" does not exist",
    "2026-10-03-wrong.md: related \"notes.txt\" must be a docs/...md path or an https:// URL",
    "open.md: status must be \"active\" in active/",
    "open.md: stage must be one of planned, running, blocked, awaiting-rerun while active",
    "open.md: result must be null while active",
    "open.md: completed-at must be null while active",
    "no-date.md: owners must be an array of strings",
    "no-date.md: completed-at must be the YYYY-MM-DD date that starts the file name",
    "no-date.md: completed file name must start with YYYY-MM-DD-",
    "bare.md: missing front matter",
    "partial.md: missing front matter keys: result, report-kind",
  ];
  for (const fragment of expected) assert.ok(problems.some(problem => problem.includes(fragment)), `${fragment}\n${problems.join("\n")}`);
  assert.equal(problems.length, expected.length);
});

test("reports links that do not resolve to tracked files", () => {
  const { problems } = inspect({
    "docs/a.md": "[gone](./gone.md) [case](./B.md) [out](../../outside.md) [bad](./%E0.md)\n",
    "docs/b.md": "",
  });
  assert.deepEqual(problems, [
    'docs/a.md: link "./gone.md" does not resolve to a tracked file',
    'docs/a.md: link "./B.md" does not resolve to a tracked file',
    'docs/a.md: link "../../outside.md" points outside the repository',
    'docs/a.md: link "./%E0.md" is not valid URL encoding',
  ]);
});

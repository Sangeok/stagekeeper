import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

export const RETIRED = [
  { pattern: /With no Propose node|has a Propose node|no propose node on this pipeline|Propose alone has no auto label/, where: ["web", "skill", "locks"], since: "2026-10-15", why: "PM automatic picking is a project setting; definitions no longer contain Propose" },
  { pattern: /Couldn(?:'|&apos;|&#39;|&#x27;)t issue the token\. Try again\./, where: ["web"], since: "2026-10-14", why: "a lost issuance response does not prove the token was not created" },
  { pattern: /needs acceptance|items need acceptance/, where: ["web", "skill", "locks"], since: "2026-10-03", why: "accept is the session’s turn; only a recorded failure waits for the owner" },
  { pattern: /This token stays valid until you revoke it\./, where: ["web", "skill", "locks"], since: "2026-10-02", why: "tokens now have optional expiry" },
  { pattern: /Counted over the last 30 days|60 calls per 10 minutes per token/, where: ["web", "skill", "locks"], since: "2026-10-02", why: "account run usage and actual request windows replace both old limits" },
  {
    pattern: /This lasts only in this terminal\. A new terminal needs the token again, and it can(?:'|&apos;|&#39;|&#x27;)t be shown again — issue another on the Tokens tab, or use a user token to set one once for every repository\./,
    where: ["web", "skill", "locks"],
    since: "2026-10-02",
    why: "a securely saved project token can be reused until revoked",
  },
  {
    pattern: /The decision wasn(?:'|&apos;|&#39;|&#x27;)t recorded/,
    where: ["web"],
    since: "2026-10-01",
    why: "the Inbox boundary catches rendering and action failures and cannot determine the commit outcome",
  },
  {
    pattern: /No validation yet|needs verification before approval|plans need verification|an unverified plan|Run plan-verifier in Claude Code first/,
    where: ["web", "skill", "locks"],
    since: "2026-09-29",
    why: "verification is the owner's choice (a Verify node or none) — a missing record reads Not verified, never a warning",
  },
  {
    pattern: /Rerunning writes the slug|project_sync.{0,20}as \{ workspaces, language \}/,
    where: ["skill"],
    since: "2026-09-28",
    why: "hu_ needs an existing-config recovery path and project on every request, not only a stored slug",
  },
  ...[
    /Scout runs only with harness\.json\.scout/,
    /Add a backlog item|Run pm in Claude Code|Set up in four steps/,
    /run pm in Claude Code to pick for you/,
    /Key must look like FEAT-01/,
    /the backlog is web only/,
  ].map((pattern) => ({ pattern, where: ["web"], since: "2026-09-26", why: "scout fills the backlog and the server assigns keys" })),
  {
    pattern: /approve the server|run \/mcp and approve/i,
    where: ["web", "skill", "locks"],
    since: "2026-09-21",
    why: "the server is registered at user scope — there is no approval prompt",
  },
  {
    pattern: /generated\s+\.mcp\.json|server to\s+\.mcp\.json/i,
    where: ["web", "skill", "locks"],
    since: "2026-09-21",
    why: "the generator writes no .mcp.json; the registration lives in the user-scope MCP config",
  },
  {
    pattern: /\$env:HARNESS_SERVER\s*=|export HARNESS_SERVER=/,
    where: ["web", "locks"],
    since: "2026-09-21",
    why: "/harness:init sets HARNESS_SERVER itself — the web no longer hands the user a line for it (the skill still names the command it runs)",
  },
];

function walk(dir, keep, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) walk(path, keep, out);
    else if (keep(entry.name)) out.push(path);
  }
  return out;
}

export function shownText(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .split(/\r?\n/)
    .filter((line) => !line.trimStart().startsWith("//"))
    .join("\n")
    .replace(/<\/?[A-Za-z][^>]*>/g, "")
    .replace(/\{"\s*"\}/g, " ")
    .replace(/\s+/g, " ");
}

it("rejects the retired commit claim in literal and all supported JSX apostrophe forms", () => {
  for (const apostrophe of ["'", "&apos;", "&#39;", "&#x27;"]) {
    assert.equal(findRetired([{ where: "web", path: "fixture.tsx", text: shownText(`<p>The decision wasn${apostrophe}t recorded. Try again.</p>`) }]).length, 1);
  }
});

export function lockBlocks(copy) {
  return [...copy.matchAll(/<!-- copy-lock:[\w-]+ -->([\s\S]*?)<!-- \/copy-lock -->/g)].map((m) => m[1]).join("\n").replaceAll("`", "");
}

export function surfaces(root = ROOT) {
  const isShownSource = (name) => /\.(ts|tsx)$/.test(name) && !/\.test\./.test(name);
  const web = ["src/fsd", "src/app"].flatMap((dir) => walk(join(root, dir), isShownSource));
  const skill = walk(join(root, "plugin/skills"), (name) => name === "SKILL.md");
  return [
    ...web.map((path) => ({ where: "web", path, text: shownText(readFileSync(path, "utf8")) })),
    ...skill.map((path) => ({ where: "skill", path, text: readFileSync(path, "utf8").replaceAll("`", "").replace(/\s+/g, " ") })),
    { where: "locks", path: join(root, "docs/conventions/product-copy.md"), text: lockBlocks(readFileSync(join(root, "docs/conventions/product-copy.md"), "utf8")).replace(/\s+/g, " ") },
  ];
}

export function findRetired(all) {
  const hits = [];
  for (const surface of all) {
    for (const rule of RETIRED) {
      if (!rule.where.includes(surface.where)) continue;
      const match = surface.text.match(rule.pattern);
      if (match) hits.push(`${relative(ROOT, surface.path).replaceAll("\\", "/")}: "${match[0]}" — retired ${rule.since}: ${rule.why}`);
    }
  }
  return hits;
}

describe("retired copy", () => {
  it("is on no shown surface — web, skill, or a copy-lock block", () => {
    assert.deepEqual(findRetired(surfaces()), []);
  });

  it("sees through JSX tags and ignores comments", () => {
    const tsx = [
      "// the old screen said approve the server",
      "<p>The generated <Code>.mcp.json</Code> references it.</p>",
    ].join("\n");
    const hits = findRetired([{ where: "web", path: join(ROOT, "x.tsx"), text: shownText(tsx) }]);
    assert.equal(hits.length, 1);
    assert.match(hits[0], /generated \.mcp\.json/);
  });

  it("lets the skill name the HARNESS_SERVER command it runs, but not the web", () => {
    const text = 'export HARNESS_SERVER="<base>"';
    assert.deepEqual(findRetired([{ where: "skill", path: join(ROOT, "SKILL.md"), text }]), []);
    assert.equal(findRetired([{ where: "web", path: join(ROOT, "x.tsx"), text }]).length, 1);
  });

  it("reads only the lock blocks of product-copy.md — the Korean rationale quotes the old copy on purpose", () => {
    const copy = "옛 문장: approve the server\n<!-- copy-lock:a -->\n> Run `/harness:init`.\n<!-- /copy-lock -->\n";
    assert.equal(lockBlocks(copy).includes("approve the server"), false);
    assert.equal(lockBlocks(copy).includes("Run /harness:init."), true);
  });
});

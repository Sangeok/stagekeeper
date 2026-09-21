// 폐기된 표현 가드. 연결 방식이 바뀌면 옛 방식을 말하는 문장이 어딘가에 남는다 — 2026-09-21에 서버 등록이
// 저장소별 `.mcp.json`에서 사용자 범위로 옮겨 갔을 때, 웹 화면 다섯 군데와 product-copy.md 자신의 두 절이
// "approve the server"·"generated .mcp.json"을 들고 남았다. 잠금 시험(src/fsd/shared/lib/copy-lock.ts)은 문서와
// 화면이 **같은지**만 보므로 둘이 같이 틀리면 통과한다. 이 시험은 그 틈을 막는다: 보이는 문구 어디에도 옛 표현이 없어야 한다.
//
// **모델을 바꾸는 PR이 여기에 한 줄을 더한다**(docs/architecture/verification.md의 체크리스트). 더하지 않으면 이 시험은
// 아무것도 모른다 — 자동으로 알아내는 장치가 아니다.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

// where: web = src/fsd·src/app의 보이는 문구, skill = plugin/skills의 SKILL.md, locks = product-copy.md의 잠금 블록.
// product-copy.md의 나머지(한국어 근거 문단)는 옛 표현을 **일부러 인용**하므로 보지 않는다.
export const RETIRED = [
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

// 주석은 보이는 문구가 아니고, 옛 표현을 설명하려고 인용하기도 한다. JSX 태그는 떼어 문장이 이어지게 한다
// ("generated <Code>.mcp.json</Code>" → "generated .mcp.json").
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

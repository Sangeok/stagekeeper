// 시험 전용. product-copy.md의 잠금 블록을 읽어, 렌더한 화면에 그 문장이 전부 있는지 본다.
// 그 파일은 "코드는 이 파일에서 나온다"고 선언하지만 강제가 없어서 두 번 어긋났다 —
// §13(PR #34, tools.test.mjs가 막는다)과 §9(2026-09-21, 문서·스킬만 고친 커밋 둘이 화면을 두고 갔다).
// 규칙은 그 파일 머리의 "Copy-lock blocks"에 있다: 한 줄 = 한 단위, ` · `가 단위를 가르고,
// 백틱·굵은글·끝의 Copy 표기는 서식이라 뗀다. 비교는 공백을 지우고 한다 — 렌더 결과는 요소 사이에
// 공백이 없어서("PowerShell$env:…") 공백까지 맞추려면 화면 구조를 문서에 적어야 한다.
import { readFileSync } from "node:fs";

const COPY_URL = new URL("../../../../docs/conventions/product-copy.md", import.meta.url);

const squeeze = (text: string) => text.replace(/\s+/g, "");

// 블록 본문 → 단위 목록. 인용 머리(`> `)와 서식을 떼고, 빈 줄은 버린다.
export function lockUnits(block: string): string[] {
  return block
    .split(/\r?\n/)
    .map((line) => line.replace(/^>\s?/, ""))
    .map((line) => line.replace(/\s*—\s*\*\*Copy\*\*\s*\/\s*"Copied"\s*$/, ""))
    .flatMap((line) => line.split(" · "))
    .map((unit) => unit.replaceAll("`", "").replaceAll("**", "").trim())
    .filter((unit) => unit.length > 0);
}

export function copyLock(id: string, copy: string = readFileSync(COPY_URL, "utf8")): string[] {
  const open = `<!-- copy-lock:${id} -->`;
  const start = copy.indexOf(open);
  if (start === -1) throw new Error(`product-copy.md has no copy-lock block "${id}"`);
  const end = copy.indexOf("<!-- /copy-lock -->", start);
  if (end === -1) throw new Error(`copy-lock block "${id}" is not closed`);
  const units = lockUnits(copy.slice(start + open.length, end));
  if (units.length === 0) throw new Error(`copy-lock block "${id}" is empty`);
  return units;
}

// renderToStaticMarkup의 결과 → 보이는 글자. 태그를 떼고 React가 이스케이프한 다섯 글자를 되돌린다.
export function visibleText(html: string): string {
  return html
    .replace(/<[^>]+>/g, "")
    .replaceAll("&#x27;", "'")
    .replaceAll("&quot;", '"')
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&");
}

// 화면에 없는 단위들. 빈 배열이면 잠금이 지켜진 것이다.
export function missingUnits(units: readonly string[], html: string): string[] {
  const screen = squeeze(visibleText(html));
  return units.filter((unit) => !screen.includes(squeeze(unit)));
}

export function lockFailure(id: string, missing: readonly string[]): string {
  return [
    `product-copy.md copy-lock "${id}": ${missing.length} line(s) are not on the screen.`,
    "Fix the screen to match the file (the file wins). If the file itself was just edited, remember a lock",
    "block is one line per unit — a hard-wrapped sentence reads as two units and neither will match.",
    ...missing.map((unit) => `  - ${unit}`),
  ].join("\n");
}

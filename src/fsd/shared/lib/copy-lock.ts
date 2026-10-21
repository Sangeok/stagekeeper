import { readFileSync } from "node:fs";

const COPY_URL = new URL("../../../../docs/conventions/product-copy.md", import.meta.url);

const squeeze = (text: string) => text.replace(/\s+/g, "");

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

export function visibleText(html: string): string {
  return html
    .replace(/<[^>]+>/g, "")
    .replaceAll("&#x27;", "'")
    .replaceAll("&quot;", '"')
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&");
}

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

import { readdirSync, readFileSync } from "node:fs";
let drift = 0;
for (const f of readdirSync("packages/core")) {
  if (!f.endsWith(".mjs") || f.endsWith(".test.mjs")) continue;
  let lib = null; try { lib = readFileSync(`plugin/lib/${f}`, "utf8"); } catch {}
  if (lib !== readFileSync(`packages/core/${f}`, "utf8")) { console.log(`drift: plugin/lib/${f}`); drift++; }
}
if (drift) { console.log("run: npm run sync:plugin-lib"); process.exit(1); }
console.log("plugin/lib in sync");

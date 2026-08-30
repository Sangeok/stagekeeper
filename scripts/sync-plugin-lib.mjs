import { copyFileSync, mkdirSync, readdirSync } from "node:fs";
mkdirSync("plugin/lib", { recursive: true });
for (const f of readdirSync("packages/core")) if (f.endsWith(".mjs") && !f.endsWith(".test.mjs")) copyFileSync(`packages/core/${f}`, `plugin/lib/${f}`);
console.log("plugin/lib synced");

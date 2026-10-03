// Private 원본을 모두 검증한 뒤 단일 transaction으로 올린다. 운영 실행은 별도 승인 범위다.
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { resolve, relative, isAbsolute, sep } from "node:path";
import { readTemplateSources, seedTemplates, snapshotTemplates } from "./lib/template-seed-query";
import { withPrisma } from "./lib/prisma";

async function main() {
  const args = process.argv.slice(2), options: Record<string, string> = {};
  for (let i = 0; i < args.length; i += 2) {
    if (!["--dir", "--snapshot"].includes(args[i]) || options[args[i]] || !args[i + 1]) throw new Error("Usage: seed:templates --dir <private root> --snapshot <private snapshot path>");
    options[args[i]] = args[i + 1];
  }
  const directory = options["--dir"] ?? "plugin/templates", rows = readTemplateSources(directory);
  if (rows.length === 0) throw new Error("No templates found");
  if (rows.some(row => row.path === "CODEX.runbook.md") && !options["--snapshot"]) throw new Error("Dual-client seed requires --snapshot outside the public repository");
  if (options["--snapshot"]) {
    const publicRoot = execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim();
    const target = resolve(options["--snapshot"]), rel = relative(publicRoot, target);
    if (rel !== ".." && !rel.startsWith(".." + sep) && !isAbsolute(rel)) throw new Error("Private snapshot cannot be written under the public repository");
  }
  const revision = execFileSync("git", ["-C", directory, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  const total = await withPrisma(prisma => prisma.$transaction(async tx => {
    const snapshot = await snapshotTemplates(tx.template, rows, revision);
    if (options["--snapshot"]) writeFileSync(options["--snapshot"], JSON.stringify(snapshot, null, 2) + "\n", { flag: "wx", mode: 0o600 });
    return seedTemplates(tx.template, rows);
  }, { isolationLevel: "Serializable", timeout: 30000 }));
  console.log(`done: ${total} templates atomically seeded from ${revision}`);
}
main().catch(() => { console.error("Template preflight/transaction failed; no partial database seed. Keep the private snapshot and inspect the approved source/DB state."); process.exitCode = 1; });

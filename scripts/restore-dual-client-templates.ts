import { readFileSync } from "node:fs";
import { restoreTemplates, type SeedSnapshot } from "./lib/template-seed-query";
import { withPrisma } from "./lib/prisma";

async function main() {
  const args = process.argv.slice(2);
  if (args.length !== 2 || args[0] !== "--snapshot") throw new Error("Usage: --snapshot <private snapshot>");
  const snapshot = JSON.parse(readFileSync(args[1], "utf8")) as SeedSnapshot;
  const count = await withPrisma(prisma => prisma.$transaction(tx => restoreTemplates(tx.template, snapshot), { isolationLevel: "Serializable", timeout: 30000 }));
  console.log(`restored: ${count} whitelisted templates`);
}
main().catch(() => { console.error("Restore refused or rolled back; snapshot/version/current-body checks must pass before any mutation."); process.exitCode = 1; });

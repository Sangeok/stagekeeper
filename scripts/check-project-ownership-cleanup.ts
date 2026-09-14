import type { CleanupMode } from "./lib/project-ownership-cleanup";

function parseMode(args: readonly string[]): CleanupMode | "help" {
  if (args.length === 1 && args[0] === "--help") return "help";
  if (args.length === 1 && args[0] === "--pre") return "pre";
  if (args.length === 1 && args[0] === "--post") return "post";
  throw new Error("usage: npm run check:project-ownership:cleanup -- --pre|--post");
}

async function main(): Promise<void> {
  let mode: CleanupMode | "help";
  try { mode = parseMode(process.argv.slice(2)); }
  catch (error) { console.error(error instanceof Error ? error.message : "invalid arguments"); process.exitCode = 2; return; }
  if (mode === "help") { console.log("usage: npm run check:project-ownership:cleanup -- --pre|--post"); return; }
  const [{ withPrisma }, { inspectOwnershipCleanup }] = await Promise.all([import("./lib/prisma"), import("./lib/project-ownership-cleanup")]);
  const exitCode = await withPrisma(async (prisma) => {
    const report = await inspectOwnershipCleanup(prisma, mode);
    console.log(JSON.stringify(report, null, 2));
    return report.ok ? 0 : 1;
  });
  process.exitCode = exitCode;
}

main().catch(() => { console.error("project ownership cleanup check failed"); process.exitCode = 1; });

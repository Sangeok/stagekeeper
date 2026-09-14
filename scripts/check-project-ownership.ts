import { checkOwnership } from "./lib/project-availability-migration";

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === "--help") {
    console.log("usage: npm run check:project-ownership");
    return;
  }
  if (args.length !== 0) {
    console.error("usage: npm run check:project-ownership");
    process.exitCode = 2;
    return;
  }

  const { withPrisma } = await import("./lib/prisma");
  const exitCode = await withPrisma(async (prisma) => {
    const report = await checkOwnership(prisma);
    console.log(JSON.stringify({ ok: report.ok, issues: report.issues }, null, 2));
    return report.ok ? 0 : 1;
  });
  process.exitCode = exitCode;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error && error.name === "MigrationIntegrityError" ? error.message : "ownership check failed");
  process.exitCode = 1;
});

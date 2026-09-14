import { parseBackfillMode, runProjectAvailabilityBackfill } from "./lib/project-availability-migration";

async function main(): Promise<void> {
  let mode: ReturnType<typeof parseBackfillMode>;
  try {
    mode = parseBackfillMode(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : "invalid arguments");
    process.exitCode = 2;
    return;
  }

  if (mode === "help") {
    console.log("usage: npm run backfill:project-availability [-- --check]\nD1 operational --apply is retired in D2.");
    return;
  }

  if (mode === "apply") {
    console.error("D1 backfill --apply is retired. D2 owns the saved project selection.");
    process.exitCode = 2;
    return;
  }

  let cancelled = false;
  const cancel = () => { cancelled = true; };
  process.once("SIGINT", cancel);
  process.once("SIGTERM", cancel);
  try {
    const { withPrisma } = await import("./lib/prisma");
    const exitCode = await withPrisma(async (prisma) => {
      const report = await runProjectAvailabilityBackfill(prisma, mode, () => cancelled);
      console.log(JSON.stringify(report, null, 2));
      if (report.failedUserId !== null || !report.ownership.ok) return 1;
      return mode === "check" && report.drift ? 1 : 0;
    });
    process.exitCode = exitCode;
  } finally {
    process.removeListener("SIGINT", cancel);
    process.removeListener("SIGTERM", cancel);
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error && error.name === "MigrationIntegrityError" ? error.message : "project availability backfill failed");
  process.exitCode = 1;
});

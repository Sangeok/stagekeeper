import type { Prisma } from "@/generated/prisma/client";

export async function readDatabaseClockIn(tx: Prisma.TransactionClient): Promise<Date> {
  // Raw timestamp mapping needs explicit UTC on non-UTC PostgreSQL sessions.
  const [row] = await tx.$queryRaw<{ now: Date }[]>`SELECT clock_timestamp() AT TIME ZONE 'UTC' AS "now"`;
  if (!row) throw new Error("Database clock unavailable");
  return row.now;
}

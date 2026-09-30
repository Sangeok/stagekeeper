import { Prisma } from "@/generated/prisma/client";

export type HistoryItemCursor = { at: Date; id: string };
export type HistoryItemRecord = HistoryItemCursor & {
  key: string;
  title: string;
  status: string;
  discardedAt: Date | null;
};

export type HistoryItemsOptions = { since: Date | null; before: HistoryItemCursor | null; limit?: number };

export function parseHistoryItemCursor(raw: string | undefined): HistoryItemCursor | null {
  if (!raw) return null;
  const match = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z)\.i\.([A-Za-z0-9_-]+)$/.exec(raw);
  if (!match) return null;
  const at = new Date(match[1]);
  return Number.isFinite(at.getTime()) && at.toISOString() === match[1] ? { at, id: match[2] } : null;
}

export function formatHistoryItemCursor(cursor: HistoryItemCursor): string {
  return `${cursor.at.toISOString()}.i.${cursor.id}`;
}

export function historyItemsQuery(projectId: string, { since, before, limit = 50 }: HistoryItemsOptions): Prisma.Sql {
  if (!Number.isSafeInteger(limit) || limit < 1) throw new RangeError("History limit must be a positive safe integer.");
  const window = since === null ? Prisma.empty : Prisma.sql`WHERE activity."at" >= ${since}`;
  const boundary = before === null ? Prisma.empty : Prisma.sql`
    WHERE (activity."at", item."id" COLLATE "C") < (${before.at}, ${before.id})`;

  // Group before applying the cursor/limit so an active item cannot crowd out others or reappear on later pages.
  return Prisma.sql`
    WITH activity AS (
      SELECT board."backlogItemId" AS "id", event."at"
      FROM "TransitionEvent" event JOIN "BoardItem" board ON board."id" = event."boardItemId"
      WHERE board."projectId" = ${projectId} AND event."note" IS DISTINCT FROM 'report'
      UNION ALL
      SELECT board."backlogItemId" AS "id", report."at"
      FROM "Report" report JOIN "BoardItem" board ON board."id" = report."boardItemId"
      WHERE board."projectId" = ${projectId}
    ), latest_activity AS (
      SELECT activity."id", MAX(activity."at") AS "at"
      FROM activity ${window} GROUP BY activity."id"
    )
    SELECT item."id", item."key", item."title", latest."status", latest."discardedAt", activity."at"
    FROM latest_activity activity
    JOIN "BacklogItem" item ON item."id" = activity."id" AND item."projectId" = ${projectId}
    JOIN LATERAL (
      SELECT board."status", board."discardedAt" FROM "BoardItem" board
      WHERE board."backlogItemId" = item."id" AND board."projectId" = ${projectId}
      ORDER BY board."proposedOn" DESC, board."id" COLLATE "C" DESC LIMIT 1
    ) latest ON TRUE
    ${boundary}
    ORDER BY activity."at" DESC, item."id" COLLATE "C" DESC LIMIT ${limit + 1}`;
}

import "server-only";

import { loadProjectRepository } from "@/server/projects/api.server";
import { latestBoardWithEvents } from "@/server/pipeline/api.server";
import { toInboxItems, type InboxItem } from "../model/inbox-item";

export async function loadInboxItems(projectId: string): Promise<InboxItem[]> {
  const [repo, rows] = await Promise.all([loadProjectRepository(projectId), latestBoardWithEvents(projectId)]);
  return toInboxItems(rows, repo);
}

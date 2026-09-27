export type BacklogView = {
  id: string; projectId: string; key: string; title: string; area: string; source: string;
  type: string | null; addedBy: string; removedReason: string | null;
  createdAt: Date; removedAt: Date | null;
};
export type BacklogWithStatusView = BacklogView & { status: string | null };

export function backlogView(row: BacklogView): BacklogView {
  return { id: row.id, projectId: row.projectId, key: row.key, title: row.title, area: row.area,
    type: row.type, addedBy: row.addedBy, removedReason: row.removedReason,
    source: row.source, createdAt: row.createdAt, removedAt: row.removedAt };
}

export function backlogWithStatusView(row: BacklogWithStatusView): BacklogWithStatusView {
  return { ...backlogView(row), status: row.status };
}

// Keep board history while projecting nested backlog data through the same boundary.
export function boardWithBacklogView<T extends { backlogItem: BacklogView }>(row: T): Omit<T, "backlogItem"> & { backlogItem: BacklogView } {
  return { ...row, backlogItem: backlogView(row.backlogItem) };
}

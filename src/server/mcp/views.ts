export type BacklogView = {
  id: string; projectId: string; key: string; title: string; area: string; source: string;
  createdAt: Date; removedAt: Date | null;
};
export type BacklogWithStatusView = BacklogView & { status: string | null };

export function backlogView(row: BacklogView): BacklogView {
  return { id: row.id, projectId: row.projectId, key: row.key, title: row.title, area: row.area,
    source: row.source, createdAt: row.createdAt, removedAt: row.removedAt };
}

export function backlogWithStatusView(row: BacklogWithStatusView): BacklogWithStatusView {
  return { ...backlogView(row), status: row.status };
}

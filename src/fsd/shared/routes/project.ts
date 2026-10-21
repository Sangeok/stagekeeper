export const PROJECT_TABS = [
  { id: "board", segment: "", label: "Board" },
  { id: "inbox", segment: "/inbox", label: "Inbox" },
  { id: "backlog", segment: "/backlog", label: "Backlog" },
  { id: "pipeline", segment: "/pipeline", label: "Pipeline" },
  { id: "history", segment: "/history", label: "History" },
  { id: "tokens", segment: "/tokens", label: "Tokens" },
] as const;

export type ProjectTabId = (typeof PROJECT_TABS)[number]["id"];
export type ProjectTabSegment = (typeof PROJECT_TABS)[number]["segment"];

export function projectPath(slug: string, segment: ProjectTabSegment = ""): string {
  return `/p/${slug}${segment}`;
}

export const PROJECT_LAYOUT_REVALIDATE_PATH = "/(app)/p/[slug]";

export function itemPath(slug: string, key: string): string {
  return `${projectPath(slug)}/items/${key}`;
}

const BACKLOG_EDIT = "edit";
const BACKLOG_REMOVED = "removed";
const BACKLOG_REMOVED_ON = "1";

export function backlogHref(slug: string, options: { edit?: string; includeRemoved?: boolean } = {}): string {
  const params = new URLSearchParams();
  if (options.edit !== undefined) params.set(BACKLOG_EDIT, options.edit);
  if (options.includeRemoved === true) params.set(BACKLOG_REMOVED, BACKLOG_REMOVED_ON);
  const query = params.toString();
  return query === "" ? projectPath(slug, "/backlog") : `${projectPath(slug, "/backlog")}?${query}`;
}

export type BacklogQuery = { editKey: string | undefined; includeRemoved: boolean };

export function readBacklogQuery(query: Record<string, string | string[] | undefined>): BacklogQuery {
  const edit = query[BACKLOG_EDIT];
  return {
    editKey: typeof edit === "string" ? edit : undefined,
    includeRemoved: query[BACKLOG_REMOVED] === BACKLOG_REMOVED_ON,
  };
}

export function activeProjectTab(pathname: string, slug: string): ProjectTabId | null {
  const base = projectPath(slug);
  if (pathname === base) return "board";
  const tab = PROJECT_TABS.find((t) => t.segment !== "" && pathname.startsWith(`${base}${t.segment}`));
  return tab === undefined ? null : tab.id;
}

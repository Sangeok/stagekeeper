// 프로젝트 탭의 URL 형태와 목록의 유일한 출처. 탭을 추가하거나 경로를 바꿀 때 여기만 고친다.
// revalidatePath는 사람이 보고 있는 경로와 문자열이 정확히 같아야 하므로 손으로 쓰지 않는다 —
// 어긋나도 컴파일 오류가 아니라 조용히 낡은 화면이 남는다.

export const PROJECT_TABS = [
  { id: "board", segment: "", label: "Board" },
  { id: "inbox", segment: "/inbox", label: "Inbox" },
  { id: "backlog", segment: "/backlog", label: "Backlog" },
  { id: "tokens", segment: "/tokens", label: "Tokens" },
] as const;

export type ProjectTabId = (typeof PROJECT_TABS)[number]["id"];
export type ProjectTabSegment = (typeof PROJECT_TABS)[number]["segment"];

export function projectPath(slug: string, segment: ProjectTabSegment = ""): string {
  return `/p/${slug}${segment}`;
}

// 항목 상세는 탭이 아니라 탭 아래의 경로다 — 탭 목록에 넣지 않고 이름 있는 빌더로 둔다.
export function itemPath(slug: string, key: string): string {
  return `${projectPath(slug)}/items/${key}`;
}

// 백로그 화면의 URL 상태. 쓰는 쪽(features의 링크)과 읽는 쪽(src/app의 라우트)이 서로 다른
// 트리에 있어서, 키 이름이나 인코딩을 바꿔도 컴파일 오류가 아니라 조용히 기능이 끊겼다.
// searchParams는 타입이 없으므로 읽기도 여기서 한 번만 한다.
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

// 지금 보고 있는 경로가 어느 탭인가. 프로젝트 밖(또는 탭이 아닌 하위 경로)이면 null.
export function activeProjectTab(pathname: string, slug: string): ProjectTabId | null {
  const base = projectPath(slug);
  if (pathname === base) return "board";
  const tab = PROJECT_TABS.find((t) => t.segment !== "" && pathname.startsWith(`${base}${t.segment}`));
  return tab === undefined ? null : tab.id;
}

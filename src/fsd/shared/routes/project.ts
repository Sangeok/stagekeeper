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

// 지금 보고 있는 경로가 어느 탭인가. 프로젝트 밖(또는 탭이 아닌 하위 경로)이면 null.
export function activeProjectTab(pathname: string, slug: string): ProjectTabId | null {
  const base = projectPath(slug);
  if (pathname === base) return "board";
  const tab = PROJECT_TABS.find((t) => t.segment !== "" && pathname.startsWith(`${base}${t.segment}`));
  return tab === undefined ? null : tab.id;
}

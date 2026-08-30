import { requireUser } from "@/server/auth/guard";

// 셸을 그리기 위한 호출이다. 인가는 데이터를 읽는 page·액션이 각자 한다(fsd.md · Next 인증 가이드).
// 머리(AppHeader)는 프로젝트를 아는 쪽이 그린다 — 프로젝트 레이아웃과 목록·생성 페이지.
export default async function AppLayout({ children }: LayoutProps<"/">) {
  await requireUser();
  return <div className="flex min-h-full flex-1 flex-col">{children}</div>;
}

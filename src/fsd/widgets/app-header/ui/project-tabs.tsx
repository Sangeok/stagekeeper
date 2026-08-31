"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/fsd/shared/lib/class-name";
import { activeProjectTab, PROJECT_TABS, projectPath } from "@/fsd/shared/routes/project";

// 활성 탭은 ink 밑줄 — 색은 사람 차례에만 쓰니 탭은 색을 갖지 않는다. Inbox 배지만 mine.
// 배지 수는 결재 대기 건수다(pendingCount) — 인박스 카드 수와 같지 않을 수 있다.
export function ProjectTabs({ slug, pendingCount }: { slug: string; pendingCount: number }) {
  const active = activeProjectTab(usePathname(), slug);
  return (
    <nav className="border-b border-rule">
      <div className="mx-auto flex w-full max-w-[800px] gap-[22px] px-5">
        {PROJECT_TABS.map((tab) => {
          const isActive = tab.id === active;
          return (
            <Link
              key={tab.id}
              href={projectPath(slug, tab.segment)}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "-mb-px inline-flex items-center gap-1.5 border-b-2 border-transparent pt-2.5 pb-[9px] text-sm text-quiet hover:text-ink",
                isActive && "border-ink font-medium text-ink",
              )}
            >
              {tab.label}
              {tab.id === "inbox" && pendingCount > 0 ? (
                <span className="min-w-[18px] rounded-full bg-mine px-1.5 text-center font-mono text-[11px] leading-4 text-on-mine">
                  {pendingCount}
                </span>
              ) : null}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

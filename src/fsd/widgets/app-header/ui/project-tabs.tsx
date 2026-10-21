"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/fsd/shared/lib/class-name";
import { activeProjectTab, PROJECT_TABS, projectPath } from "@/fsd/shared/routes/project";

export function ProjectTabs({ slug, pendingCount }: { slug: string; pendingCount: number }) {
  const active = activeProjectTab(usePathname(), slug);
  return (
    <nav className="border-b border-rule">
      <div className="mx-auto flex w-full max-w-[800px] gap-[22px] overflow-x-auto overflow-y-hidden px-5">
        {PROJECT_TABS.map((tab) => {
          const isActive = tab.id === active;
          return (
            <Link
              key={tab.id}
              href={projectPath(slug, tab.segment)}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "inline-flex shrink-0 items-center gap-1.5 border-b-2 border-transparent pt-2.5 pb-[9px] text-sm whitespace-nowrap text-quiet hover:text-ink",
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

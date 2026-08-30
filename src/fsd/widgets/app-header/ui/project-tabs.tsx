"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/fsd/shared/lib/class-name";

const TABS = [
  { href: "", label: "Board" },
  { href: "/inbox", label: "Inbox" },
  { href: "/backlog", label: "Backlog" },
  { href: "/tokens", label: "Tokens" },
];

// 활성 탭은 ink 밑줄 — 색은 사람 차례에만 쓰니 탭은 색을 갖지 않는다. Inbox 배지만 mine.
export function ProjectTabs({ slug, inboxCount }: { slug: string; inboxCount: number }) {
  const pathname = usePathname();
  const base = `/p/${slug}`;
  const isActive = (href: string) => (href === "" ? pathname === base : pathname.startsWith(`${base}${href}`));
  return (
    <nav className="border-b border-rule">
      <div className="mx-auto flex w-full max-w-[800px] gap-[22px] px-5">
        {TABS.map((tab) => {
          const active = isActive(tab.href);
          return (
            <Link
              key={tab.label}
              href={`${base}${tab.href}`}
              aria-current={active ? "page" : undefined}
              className={cn(
                "-mb-px inline-flex items-center gap-1.5 border-b-2 border-transparent pt-2.5 pb-[9px] text-sm text-quiet hover:text-ink",
                active && "border-ink font-medium text-ink",
              )}
            >
              {tab.label}
              {tab.href === "/inbox" && inboxCount > 0 ? (
                <span className="min-w-[18px] rounded-full bg-mine px-1.5 text-center font-mono text-[11px] leading-4 text-on-mine">
                  {inboxCount}
                </span>
              ) : null}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

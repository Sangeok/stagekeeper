import Link from "next/link";
import type { ReactElement, ReactNode } from "react";

import { docsPath } from "@/fsd/shared/routes/docs";

export function SiteHeader({ children }: { children: ReactNode }): ReactElement {
  return (
    <header className="border-b border-rule">
      <div className="mx-auto flex min-h-16 w-full max-w-[1040px] items-center justify-between gap-4 px-4 py-3 md:px-6">
        <Link href="/" className="shrink-0 font-semibold tracking-[-0.01em]">
          Stagekeeper
        </Link>
        <nav aria-label="Main navigation" className="flex items-center gap-3 text-sm sm:gap-5">
          <Link href={docsPath("overview")} className="underline underline-offset-[3px]">Docs</Link>
          {children}
        </nav>
      </div>
    </header>
  );
}

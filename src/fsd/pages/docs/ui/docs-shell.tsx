import Link from "next/link";
import type { ReactElement, ReactNode } from "react";

import { docsPath } from "@/fsd/shared/routes/docs";
import { projectsPath } from "@/fsd/shared/routes/projects";
import { ButtonLink } from "@/fsd/shared/ui/button";

export function DocsShell({ children }: { children: ReactNode }): ReactElement {
  return (
    <div className="flex min-h-screen flex-1 flex-col">
      <a href="#docs-content" className="sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-50 focus:rounded-md focus:bg-paper focus:px-4 focus:py-3 focus:text-ink focus:outline-2 focus:outline-mine">
        Skip to content
      </a>
      <header className="border-b border-rule">
        <div className="mx-auto flex w-full max-w-[1160px] flex-wrap items-center justify-between gap-4 px-4 py-4 md:px-6">
          <Link href="/" className="font-semibold tracking-tight">Stagekeeper</Link>
          <nav aria-label="Main navigation" className="flex items-center gap-4 text-sm">
            <Link href={docsPath("overview")} className="underline underline-offset-4">Docs</Link>
            <ButtonLink href={projectsPath()} prefetch={false} variant="mine" size="sm">Open Stagekeeper</ButtonLink>
          </nav>
        </div>
      </header>
      {children}
      <footer className="mt-auto border-t border-rule">
        <div className="mx-auto flex w-full max-w-[1160px] flex-wrap justify-between gap-3 px-4 py-5 text-xs text-quiet md:px-6">
          <Link href="/">Stagekeeper</Link>
          <Link href={docsPath("getting-started")} className="underline underline-offset-4">Get started</Link>
        </div>
      </footer>
    </div>
  );
}

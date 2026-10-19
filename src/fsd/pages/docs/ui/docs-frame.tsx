import Link from "next/link";
import type { ReactElement, ReactNode } from "react";

import { cn } from "@/fsd/shared/lib/class-name";
import type { DocsId } from "@/fsd/shared/routes/docs";

import { DOCS_PAGES, getDocsPage } from "../model/docs-pages";

export function DocsFrame({ id, children }: { id: DocsId; children: ReactNode }): ReactElement {
  const page = getDocsPage(id);
  const index = DOCS_PAGES.findIndex((entry) => entry.id === id);
  const previous = DOCS_PAGES[index - 1];
  const next = DOCS_PAGES[index + 1];

  return (
    <div className="mx-auto grid w-full max-w-[1160px] flex-1 gap-8 px-4 py-8 md:px-6 lg:grid-cols-[11rem_minmax(0,1fr)] lg:gap-14 lg:py-12">
      <aside className="min-w-0 lg:sticky lg:top-8 lg:self-start">
        <nav aria-label="Documentation">
          <p className="mb-3 text-xs font-medium text-quiet">Docs</p>
          <ul className="flex flex-wrap gap-x-5 gap-y-3 text-sm lg:flex-col lg:gap-y-1">
            {DOCS_PAGES.map((entry) => (
              <li key={entry.id}>
                <Link href={entry.path} aria-current={entry.id === id ? "page" : undefined}
                  className={cn("inline-block py-1 underline-offset-4 hover:underline", entry.id === id ? "font-medium text-ink underline" : "text-quiet")}>
                  {entry.nav}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </aside>
      <main id="docs-content" tabIndex={-1} className="min-w-0 max-w-[760px] scroll-mt-6 focus-visible:outline-2 focus-visible:outline-offset-8 focus-visible:outline-mine">
        <article>
          <header className="border-b border-rule pb-8">
            <h1 className="max-w-[28ch] text-[clamp(28px,3.5vw,40px)] leading-[1.12] font-semibold tracking-[-0.025em] text-balance">{page.title}</h1>
            <p className="mt-5 max-w-[65ch] text-base leading-7 text-quiet">{page.description}</p>
          </header>
          <div className="mt-9 space-y-10 text-[15px] leading-7 [&_h2]:mb-4 [&_h2]:text-xl [&_h2]:leading-7 [&_h2]:font-semibold [&_h2]:tracking-tight [&_p+p]:mt-4 [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-5 [&_a]:underline [&_a]:underline-offset-4 [&_th]:text-left [&_th]:font-medium [&_th]:text-quiet [&_th]:align-top [&_td]:align-top">
            {children}
          </div>
        </article>
        <nav aria-label="Page navigation" className="mt-12 grid grid-cols-2 gap-4 border-t border-rule pt-6 pb-8 text-sm">
          <div>{previous ? <Link href={previous.path} className="block"><span className="block text-xs text-quiet">Previous</span><span className="mt-1 block underline underline-offset-4">{previous.nav}</span></Link> : null}</div>
          <div className="text-right">{next ? <Link href={next.path} className="block"><span className="block text-xs text-quiet">Next</span><span className="mt-1 block underline underline-offset-4">{next.nav}</span></Link> : null}</div>
        </nav>
      </main>
    </div>
  );
}

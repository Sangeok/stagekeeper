import Link from "next/link";

export type HeaderProject = { slug: string; name: string };

// 셸 머리. Server Component에서 그려도 되게 hook이 없다 — 프로젝트 전환은 <details>로 연다.
export function AppHeader({
  login,
  project,
  projects = [],
}: {
  login: string;
  project?: HeaderProject;
  projects?: HeaderProject[];
}) {
  return (
    <header className="border-b border-rule">
      <div className="mx-auto flex w-full max-w-[800px] items-center gap-2.5 px-5 py-3">
        <Link href="/projects" className="font-semibold tracking-[-0.01em]">
          Stagekeeper
        </Link>
        {project !== undefined ? (
          <>
            <span aria-hidden="true" className="text-edge">
              /
            </span>
            <ProjectSwitcher current={project} projects={projects} />
          </>
        ) : null}
        <span className="ml-auto font-mono text-xs text-quiet">{login}</span>
      </div>
    </header>
  );
}

function ProjectSwitcher({ current, projects }: { current: HeaderProject; projects: HeaderProject[] }) {
  const others = projects.filter((p) => p.slug !== current.slug);
  return (
    <details className="relative -ml-1.5">
      <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 rounded-md border border-transparent px-1.5 py-0.5 font-mono text-[13px] hover:border-rule hover:bg-paper [&::-webkit-details-marker]:hidden">
        {current.name}
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true" className="text-quiet">
          <path d="M2 3.5l3 3 3-3" fill="none" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      </summary>
      <ul className="absolute left-0 top-full z-40 mt-1 min-w-52 rounded-lg border border-rule bg-paper py-1 text-sm">
        {others.map((p) => (
          <li key={p.slug}>
            <Link href={`/p/${p.slug}`} className="block px-3 py-1.5 font-mono text-[13px] hover:bg-field">
              {p.name}
            </Link>
          </li>
        ))}
        {others.length > 0 ? <li aria-hidden="true" className="my-1 border-t border-rule" /> : null}
        <li>
          <Link href="/projects" className="block px-3 py-1.5 hover:bg-field">
            All projects
          </Link>
        </li>
        <li>
          <Link href="/p/new" className="block px-3 py-1.5 hover:bg-field">
            New project
          </Link>
        </li>
      </ul>
    </details>
  );
}

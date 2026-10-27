import Link from "next/link";

import type { Plan } from "@harness/core/entitlement.mjs";
import { planLabel } from "@/fsd/entities/account-plan";
import { billingPath } from "@/fsd/shared/routes/billing";
import { projectPath } from "@/fsd/shared/routes/project";
import { newProjectPath, projectsPath } from "@/fsd/shared/routes/projects";
import { userTokensPath } from "@/fsd/shared/routes/user-tokens";

export type HeaderProject = { slug: string; name: string };

export function AppHeader({
  login,
  project,
  projects = [],
  plan,
}: {
  login: string;
  project?: HeaderProject;
  projects?: HeaderProject[];
  plan?: Plan;
}) {
  return (
    <header className="border-b border-rule">
      <div className="mx-auto flex w-full max-w-[800px] flex-wrap items-center gap-x-2.5 gap-y-1.5 px-5 py-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <Link href={projectsPath()} className="font-semibold tracking-[-0.01em]">
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
        </div>
        <div className="ml-auto flex min-w-0 items-center gap-2.5">
          <Link href={userTokensPath()} className="text-xs text-quiet hover:text-ink">
            Tokens
          </Link>
          {plan !== undefined ? (
            <Link
              href={billingPath()}
              className="rounded-full border border-rule px-2 py-0.5 text-xs text-quiet hover:bg-field"
            >
              {planLabel(plan)}
            </Link>
          ) : null}
          <span className="truncate font-mono text-xs text-quiet">{login}</span>
        </div>
      </div>
    </header>
  );
}

function ProjectSwitcher({ current, projects }: { current: HeaderProject; projects: HeaderProject[] }) {
  const others = projects.filter((p) => p.slug !== current.slug);
  return (
    <details className="relative -ml-1.5 min-w-0">
      <summary className="inline-flex max-w-full cursor-pointer list-none items-center gap-1.5 rounded-md border border-transparent px-1.5 py-0.5 font-mono text-[13px] hover:border-rule hover:bg-paper [&::-webkit-details-marker]:hidden">
        <span className="truncate">{current.name}</span>
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true" className="shrink-0 text-quiet">
          <path d="M2 3.5l3 3 3-3" fill="none" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      </summary>
      <ul className="absolute left-0 top-full z-40 mt-1 min-w-44 rounded-lg border border-rule bg-paper py-1 text-sm sm:min-w-52">
        {others.map((p) => (
          <li key={p.slug}>
            <Link href={projectPath(p.slug)} className="block px-3 py-1.5 font-mono text-[13px] [overflow-wrap:anywhere] hover:bg-field">
              {p.name}
            </Link>
          </li>
        ))}
        {others.length > 0 ? <li aria-hidden="true" className="my-1 border-t border-rule" /> : null}
        <li>
          <Link href={projectsPath()} className="block px-3 py-1.5 hover:bg-field">
            All projects
          </Link>
        </li>
        <li>
          <Link href={newProjectPath()} className="block px-3 py-1.5 hover:bg-field">
            New project
          </Link>
        </li>
      </ul>
    </details>
  );
}

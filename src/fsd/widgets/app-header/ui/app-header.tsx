import Link from "next/link";

import { type PlanId, planLabel } from "@/fsd/shared/lib/entitlement-copy";
import { billingPath } from "@/fsd/shared/routes/billing";
import { projectPath } from "@/fsd/shared/routes/project";
import { newProjectPath, projectsPath } from "@/fsd/shared/routes/projects";
import { userTokensPath } from "@/fsd/shared/routes/user-tokens";

export type HeaderProject = { slug: string; name: string };

// 셸 머리. Server Component에서 그려도 되게 hook이 없다 — 프로젝트 전환은 <details>로 연다.
export function AppHeader({
  login,
  project,
  projects = [],
  plan,
}: {
  login: string;
  project?: HeaderProject;
  projects?: HeaderProject[];
  plan?: PlanId;
}) {
  return (
    <header className="border-b border-rule">
      <div className="mx-auto flex w-full max-w-[800px] items-center gap-2.5 px-5 py-3">
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
        {/* 계정 단위 토큰 화면의 유일한 진입점. (app) 셸에는 내비게이션이 없어서, 여기에 링크를 걸지
            않으면 /settings/tokens는 주소를 직접 치는 사람만 닿을 수 있다 — 화면이 있어도 없는 것과 같다.
            프로젝트 안팎 어디서나 보여야 하므로 프로젝트 전환기가 아니라 머리에 둔다. */}
        <Link href={userTokensPath()} className="ml-auto text-xs text-quiet hover:text-ink">
          Tokens
        </Link>
        {/* 플랜 배지. 상한에 걸렸을 때 어디를 봐야 하는지가 머리에서 늘 보이게 한다. */}
        {plan !== undefined ? (
          <Link
            href={billingPath()}
            className="rounded-full border border-rule px-2 py-0.5 text-xs text-quiet hover:bg-field"
          >
            {planLabel(plan)}
          </Link>
        ) : null}
        <span className="font-mono text-xs text-quiet">{login}</span>
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
            <Link href={projectPath(p.slug)} className="block px-3 py-1.5 font-mono text-[13px] hover:bg-field">
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

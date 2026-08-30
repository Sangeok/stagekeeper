import Link from "next/link";

export type ProjectSummary = { slug: string; name: string; owner: string; repo: string };

export function ProjectListPage({ projects }: { projects: ProjectSummary[] }) {
  return (
    <main className="mx-auto w-full max-w-3xl space-y-6 px-4 py-10">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Projects</h1>
        <Link href="/p/new" className="rounded-md bg-black px-4 py-2 text-sm text-white">
          New project
        </Link>
      </div>
      {projects.length === 0 ? (
        <p className="text-sm text-zinc-600">
          No projects yet. Connect a repository to get a board, a backlog, and an inbox.
        </p>
      ) : (
        <ul className="divide-y divide-zinc-200 rounded-md border border-zinc-200">
          {projects.map((p) => (
            <li key={p.slug}>
              <Link href={`/p/${p.slug}`} className="block px-4 py-3 hover:bg-zinc-50">
                <span className="font-medium">{p.name}</span>
                <span className="ml-2 font-mono text-xs text-zinc-500">
                  {p.owner}/{p.repo}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

import Link from "next/link";
import { BacklogForm, BacklogTable, type BacklogFormState, type BacklogRow } from "@/fsd/features/edit-backlog";

type Props = {
  slug: string;
  rows: BacklogRow[];
  includeRemoved: boolean;
  editing?: { key: string; title: string; area: string; source: string };
  add: (prev: BacklogFormState, form: FormData) => Promise<BacklogFormState>;
  update: (prev: BacklogFormState, form: FormData) => Promise<BacklogFormState>;
  remove: (key: string) => Promise<{ error?: string }>;
};

export function ProjectBacklogPage({ slug, rows, includeRemoved, editing, add, update, remove }: Props) {
  return (
    <main className="mx-auto w-full max-w-3xl space-y-6 px-4 py-10">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">백로그</h1>
        <Link
          href={includeRemoved ? `/p/${slug}/backlog` : `/p/${slug}/backlog?removed=1`}
          className="text-sm underline"
        >
          {includeRemoved ? "제거된 항목 숨기기" : "제거된 항목 보기"}
        </Link>
      </div>
      <BacklogTable slug={slug} rows={rows} remove={remove} />
      {editing ? <BacklogForm action={update} item={editing} /> : <BacklogForm action={add} />}
    </main>
  );
}

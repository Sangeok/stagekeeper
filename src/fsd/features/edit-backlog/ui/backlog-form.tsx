"use client";
import { useActionState } from "react";
import { SOURCE_HELP, type BacklogFormState } from "../model/backlog-form-state";

type Props = {
  action: (prev: BacklogFormState, form: FormData) => Promise<BacklogFormState>;
  item?: { key: string; title: string; area: string; source: string };
};

// item이 있으면 편집, 없으면 추가. 서버 액션은 route가 prop으로 넘긴다.
export function BacklogForm({ action, item }: Props) {
  const [state, formAction, pending] = useActionState(action, {} as BacklogFormState);
  const editing = item !== undefined;

  return (
    <form action={formAction} className="space-y-3 rounded-md border border-zinc-200 p-4">
      <h2 className="text-sm font-semibold">{editing ? `${item.key} 편집` : "백로그 항목 추가"}</h2>
      {editing ? null : (
        <label className="block space-y-1">
          <span className="text-sm font-medium">key *</span>
          <input name="key" required placeholder="FEAT-01" className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm" />
        </label>
      )}
      <label className="block space-y-1">
        <span className="text-sm font-medium">제목 *</span>
        <input name="title" required defaultValue={item?.title} className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm" />
      </label>
      <label className="block space-y-1">
        <span className="text-sm font-medium">영역</span>
        <input name="area" defaultValue={item?.area} placeholder="src/server/pipeline" className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm" />
      </label>
      <label className="block space-y-1">
        <span className="text-sm font-medium">증거</span>
        <textarea name="source" rows={3} defaultValue={item?.source} className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm" />
        <span className="block text-xs text-zinc-500">{SOURCE_HELP}</span>
      </label>
      {state.error ? <p className="text-sm text-red-600">{state.error}</p> : null}
      <button type="submit" disabled={pending} className="rounded-md bg-black px-4 py-2 text-sm text-white disabled:opacity-50">
        {pending ? "저장 중…" : editing ? "저장" : "추가"}
      </button>
    </form>
  );
}

"use client";
import { useActionState } from "react";
import { SOURCE_HELP, type BacklogFormState } from "../model/backlog-form-state";

type Props = {
  action: (prev: BacklogFormState, form: FormData) => Promise<BacklogFormState>;
  item?: { key: string; title: string; area: string; source: string };
};

const FIELD_CLASS = "w-full rounded-md border border-zinc-300 px-3 py-2 text-sm";

// item이 있으면 편집, 없으면 추가. 서버 액션은 route가 prop으로 넘긴다.
export function BacklogForm({ action, item }: Props) {
  const [state, formAction, pending] = useActionState(action, {} as BacklogFormState);
  const editing = item !== undefined;

  return (
    <form action={formAction} className="space-y-3 rounded-md border border-zinc-200 p-4">
      <h2 className="text-sm font-semibold">{editing ? `Edit ${item.key}` : "Add backlog item"}</h2>
      {editing ? null : (
        <label className="block space-y-1">
          <span className="text-sm font-medium">Key</span>
          <input name="key" required placeholder="FEAT-01" className={FIELD_CLASS} />
        </label>
      )}
      <label className="block space-y-1">
        <span className="text-sm font-medium">Title</span>
        <input name="title" required defaultValue={item?.title} className={FIELD_CLASS} />
      </label>
      <label className="block space-y-1">
        <span className="text-sm font-medium">Area</span>
        <input name="area" defaultValue={item?.area} placeholder="src/server/pipeline" className={FIELD_CLASS} />
      </label>
      <label className="block space-y-1">
        <span className="text-sm font-medium">Evidence</span>
        <textarea name="source" rows={3} defaultValue={item?.source} className={FIELD_CLASS} />
        <span className="block text-xs text-zinc-500">{SOURCE_HELP}</span>
      </label>
      {state.error ? <p className="text-sm text-red-600">{state.error}</p> : null}
      <button type="submit" disabled={pending} className="rounded-md bg-black px-4 py-2 text-sm text-white disabled:opacity-50">
        {pending ? "Saving…" : editing ? "Save" : "Add"}
      </button>
    </form>
  );
}

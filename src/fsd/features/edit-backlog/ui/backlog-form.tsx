"use client";
import { ITEM_TYPES } from "@harness/core/backlog.mjs";
import { useActionState, useState } from "react";

import { Button } from "@/fsd/shared/ui/button";
import { cardClass } from "@/fsd/shared/ui/card";
import { Field, Input, Textarea } from "@/fsd/shared/ui/field";
import { IDLE, SOURCE_HELP, type BacklogFormAction, type BacklogFormState } from "../model/backlog-form-state";

type Props = {
  action: BacklogFormAction;
  item?: { key: string; title: string; area: string; source: string; type: string | null };
};

// React resets forms during commit, while its synthetic event handlers are paused.
// Use a native listener: this controlled draft is cleared only after a successful add.
function preserveDraftOnReset(form: HTMLFormElement): () => void {
  const preventReset = (event: Event) => event.preventDefault();
  form.addEventListener("reset", preventReset);
  return () => form.removeEventListener("reset", preventReset);
}

// item이 있으면 편집, 없으면 추가. 서버 액션은 route가 prop으로 넘긴다.
export function BacklogForm({ action, item }: Props) {
  const isEditing = item !== undefined;
  const emptyValues = { title: "", area: "", source: "", type: "" };
  const [values, setValues] = useState(item ? { ...item, type: item.type ?? "" } : emptyValues);
  // The CAS baseline belongs to this draft, not to refreshed props for the same key.
  const [typeBefore, setTypeBefore] = useState(item?.type ?? "");
  const [state, formAction, pending] = useActionState(async (prev: BacklogFormState, form: FormData) => {
    const next = await action(prev, form);
    // React resets uncontrolled fields even when an action returns a validation error.
    // Keep the draft on failure; only a successful addition starts a blank draft.
    if (next.status === "saved") {
      if (!isEditing) setValues(emptyValues);
      else if (form.get("type") !== form.get("typeBefore")) setTypeBefore(String(form.get("type") ?? ""));
    }
    return next;
  }, IDLE);

  return (
    <form ref={preserveDraftOnReset} action={formAction} className={cardClass()}>
      <h2 className="text-sm font-medium">{isEditing ? `Edit ${item.key}` : "Add backlog item"}</h2>
      {isEditing ? <input type="hidden" name="typeBefore" value={typeBefore} /> : null}
      <Field label="Title">
        <Input name="title" required value={values.title} onChange={(e) => setValues({ ...values, title: e.target.value })} disabled={pending} />
      </Field>
      <Field label="Type" optional>
        <select name="type" value={values.type} onChange={(e) => setValues({ ...values, type: e.target.value })} disabled={pending}
          className="rounded-md border border-edge bg-paper px-2.5 py-[7px] text-sm text-ink disabled:opacity-50">
          <option value="">—</option>
          {ITEM_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
        </select>
      </Field>
      <Field label="Area" optional hint="Leave it empty if you don't know — the agents will find it.">
        <Input name="area" value={values.area} onChange={(e) => setValues({ ...values, area: e.target.value })} disabled={pending} placeholder="src/server/pipeline" />
      </Field>
      {/* "Evidence"는 보드 항목의 근거(board.reason)에 붙는 승인 용어다(CONTEXT.md). 백로그의 이 칸은
          다른 필드이므로 같은 이름을 쓰면 소유자가 인박스에서 자기가 쓴 글을 본다고 착각한다.
          열 이름·MCP backlog_get·SOURCE_HELP가 모두 source라 화면도 그 이름을 쓴다. */}
      <Field label="Source" optional hint={SOURCE_HELP}>
        <Textarea name="source" rows={3} value={values.source} onChange={(e) => setValues({ ...values, source: e.target.value })} disabled={pending} />
      </Field>
      {state.status === "error" ? <p className="text-sm text-risk">{state.error}</p> : null}
      <div>
        <Button variant="mine" type="submit" disabled={pending}>
          {pending ? "Saving…" : isEditing ? "Save" : "Add"}
        </Button>
      </div>
    </form>
  );
}

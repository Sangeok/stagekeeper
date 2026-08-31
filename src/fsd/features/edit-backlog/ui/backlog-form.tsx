"use client";
import { useActionState } from "react";

import { Button } from "@/fsd/shared/ui/button";
import { cardClass } from "@/fsd/shared/ui/card";
import { Field, Input, Textarea } from "@/fsd/shared/ui/field";
import { SOURCE_HELP, type BacklogFormAction } from "../model/backlog-form-state";

type Props = {
  action: BacklogFormAction;
  item?: { key: string; title: string; area: string; source: string };
};

// item이 있으면 편집, 없으면 추가. 서버 액션은 route가 prop으로 넘긴다.
export function BacklogForm({ action, item }: Props) {
  const [state, formAction, pending] = useActionState(action, {});
  const isEditing = item !== undefined;

  return (
    <form action={formAction} className={cardClass()}>
      <h2 className="text-sm font-medium">{isEditing ? `Edit ${item.key}` : "Add backlog item"}</h2>
      {isEditing ? null : (
        <Field label="Key">
          <Input name="key" required placeholder="FEAT-01" />
        </Field>
      )}
      <Field label="Title">
        <Input name="title" required defaultValue={item?.title} />
      </Field>
      <Field label="Area">
        <Input name="area" defaultValue={item?.area} placeholder="src/server/pipeline" />
      </Field>
      <Field label="Evidence" hint={SOURCE_HELP}>
        <Textarea name="source" rows={3} defaultValue={item?.source} />
      </Field>
      {state.error ? <p className="text-sm text-risk">{state.error}</p> : null}
      <div>
        <Button variant="mine" type="submit" disabled={pending}>
          {pending ? "Saving…" : isEditing ? "Save" : "Add"}
        </Button>
      </div>
    </form>
  );
}

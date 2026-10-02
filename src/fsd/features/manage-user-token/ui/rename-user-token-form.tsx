"use client";
import { useState, useTransition, type ReactElement } from "react";
import { useRouter } from "next/navigation";
import type { ActionResult } from "@/fsd/shared/api/result";
import { Button } from "@/fsd/shared/ui/button";
import { Input } from "@/fsd/shared/ui/field";

export function RenameUserTokenForm({ label, rename }: { label: string; rename: (label: string) => Promise<ActionResult<null>> }): ReactElement {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  return <form onSubmit={(event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const value = String(new FormData(form).get("label") ?? "");
    startTransition(async () => {
      try {
        const result = await rename(value);
        setError(result.success ? null : result.error);
        if (!result.success) { form.reset(); router.refresh(); }
      } catch {
        setError("Could not save the name. The list will be refreshed.");
        form.reset();
        router.refresh();
      }
    });
  }} className="flex min-w-48 flex-wrap items-center gap-2">
    <Input key={label} name="label" defaultValue={label} aria-label={`Token name: ${label}`} required disabled={pending} className="w-40" />
    <Button size="sm" type="submit" disabled={pending}>{pending ? "Saving…" : "Save name"}</Button>
    {error ? <p role="alert" className="w-full text-xs text-risk">{error}</p> : null}
  </form>;
}

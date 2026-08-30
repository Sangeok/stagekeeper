"use client";
import { useState, useTransition } from "react";

import { TokenReveal } from "@/fsd/entities/project-token";
import { Button } from "@/fsd/shared/ui/button";
import { Field, Input } from "@/fsd/shared/ui/field";

// 서버 액션은 route가 prop으로 넘긴다 — "use client" 파일은 *.server를 import할 수 없다(fsd.md).
type Props = { issue: (label: string) => Promise<{ token: string }>; mcpUrl: string };

export function NewTokenForm({ issue, mcpUrl }: Props) {
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex flex-col gap-4">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          const label = String(new FormData(event.currentTarget).get("label") ?? "");
          startTransition(async () => {
            try {
              setToken((await issue(label)).token);
              setError(null);
            } catch {
              setError("Couldn't issue the token. Try again.");
            }
          });
        }}
        className="flex items-end gap-2"
      >
        <Field label="Label" className="flex-1">
          <Input name="label" placeholder="laptop" />
        </Field>
        <Button variant="mine" type="submit" disabled={pending}>
          {pending ? "Issuing…" : "Issue token"}
        </Button>
      </form>
      {error ? <p className="text-sm text-risk">{error}</p> : null}
      {token ? <TokenReveal token={token} mcpUrl={mcpUrl} /> : null}
    </div>
  );
}

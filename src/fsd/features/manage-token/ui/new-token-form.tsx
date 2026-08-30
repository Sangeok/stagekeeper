"use client";
import { useState, useTransition } from "react";
import { TokenReveal } from "@/fsd/entities/project-token";

// 서버 액션은 route가 prop으로 넘긴다 — "use client" 파일은 *.server를 import할 수 없다(fsd.md).
type Props = { issue: (label: string) => Promise<{ token: string }>; mcpUrl: string };

export function NewTokenForm({ issue, mcpUrl }: Props) {
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="space-y-4">
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
        <label className="flex-1 space-y-1">
          <span className="text-sm font-medium">Label</span>
          <input name="label" placeholder="laptop" className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm" />
        </label>
        <button type="submit" disabled={pending} className="rounded-md bg-black px-4 py-2 text-sm text-white disabled:opacity-50">
          {pending ? "Issuing…" : "Issue token"}
        </button>
      </form>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {token ? <TokenReveal token={token} mcpUrl={mcpUrl} /> : null}
    </div>
  );
}

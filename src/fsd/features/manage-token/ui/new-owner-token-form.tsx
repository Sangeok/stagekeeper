"use client";
import { useState, useTransition, type ReactElement } from "react";
import { useRouter } from "next/navigation";
import { parseTokenExpiryInput } from "@harness/core/token-validity.mjs";

import { OwnerTokenReveal } from "@/fsd/entities/project-token";
import type { ActionResult } from "@/fsd/shared/api/result";
import { Button } from "@/fsd/shared/ui/button";
import { Field, Input } from "@/fsd/shared/ui/field";

// 서버 액션은 route가 prop으로 넘긴다 — "use client" 파일은 *.server를 import할 수 없다(fsd.md).
type Props = { issue: (label: string, expiresAt: string | null) => Promise<ActionResult<{ token: string }>>; ownerMcpUrl: string };

export function NewOwnerTokenForm({ issue, ownerMcpUrl }: Props): ReactElement {
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [issuedExpiry, setIssuedExpiry] = useState<string | null>(null);
  const router = useRouter();

  return (
    <div className="flex flex-col gap-4">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          const label = String(data.get("label") ?? "");
          const expiryInput = String(data.get("expiry") ?? "");
          let expiry: string | null;
          try { expiry = parseTokenExpiryInput(expiryInput)?.toISOString() ?? null; }
          catch { setError("Choose a future expiry in UTC, or leave it blank for no expiry."); return; }
          startTransition(async () => {
            try {
              const result = await issue(label, expiry);
              if (!result.success) {
                setError(result.error);
                router.refresh();
                return;
              }
              setToken(result.data.token);
              setIssuedExpiry(expiry);
              setError(null);
            } catch {
              setError("Couldn't issue the token. Try again.");
              router.refresh();
            }
          });
        }}
        className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-start"
      >
        <Field label="Token name" hint="Name the device or purpose so you can recognize this token later." className="flex-1">
          <Input name="label" disabled={pending} placeholder="my laptop session" />
        </Field>
        <Field label="Expires at (UTC)" hint="YYYY-MM-DD HH:mm. Leave blank for no expiry.">
          <Input name="expiry" type="text" placeholder="YYYY-MM-DD HH:mm" disabled={pending} />
        </Field>
        <Button className="sm:mt-6" variant="mine" type="submit" disabled={pending}>
          {pending ? "Issuing…" : "Issue owner token"}
        </Button>
      </form>
      {error ? <p role="alert" className="text-sm text-risk">{error}</p> : null}
      {token ? <p className="text-sm text-quiet">{issuedExpiry ? "Expires at " + issuedExpiry.slice(0, 16).replace("T", " ") + " UTC" : "No expiry"}</p> : null}
      {token ? <OwnerTokenReveal token={token} ownerMcpUrl={ownerMcpUrl} /> : null}
    </div>
  );
}

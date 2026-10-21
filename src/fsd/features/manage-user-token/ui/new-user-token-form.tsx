"use client";
import { useState, useTransition, type ReactElement } from "react";
import { useRouter } from "next/navigation";
import { parseTokenExpiryInput } from "@harness/core/token-validity.mjs";

import { TokenReveal } from "@/fsd/entities/project-token";
import type { ActionResult } from "@/fsd/shared/api/result";
import { Button } from "@/fsd/shared/ui/button";
import { Field, Input } from "@/fsd/shared/ui/field";

type Props = { issue: (label: string, expiresAt: string | null) => Promise<ActionResult<{ token: string }>>; mcpUrl: string };

type IssuedToken = { token: string; expiresAt: string | null };
type IssueState =
  | { status: "idle"; previous: null }
  | { status: "pending"; previous: IssuedToken | null }
  | { status: "rejected"; previous: IssuedToken | null; error: string }
  | { status: "unknown"; previous: IssuedToken | null }
  | { status: "succeeded"; issued: IssuedToken };

const ISSUE_UNKNOWN = "Couldn't confirm whether the token was issued. Refresh the list before trying again. If you identify a token whose value you did not receive, revoke it before issuing another.";

export function NewUserTokenForm({ issue, mcpUrl }: Props): ReactElement {
  const [state, setState] = useState<IssueState>({ status: "idle", previous: null });
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const issued = state.status === "succeeded" ? state.issued : state.previous;
  const error = state.status === "rejected" ? state.error : state.status === "unknown" ? ISSUE_UNKNOWN : null;

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
          catch { setState({ status: "rejected", previous: issued, error: "Choose a future expiry in UTC, or leave it blank for no expiry." }); return; }
          setState({ status: "pending", previous: issued });
          startTransition(async () => {
            try {
              const result = await issue(label, expiry);
              if (!result.success) {
                setState({ status: "rejected", previous: issued, error: result.error });
                router.refresh();
                return;
              }
              setState({ status: "succeeded", issued: { token: result.data.token, expiresAt: expiry } });
            } catch {
              setState({ status: "unknown", previous: issued });
              router.refresh();
            }
          });
        }}
        className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-start"
      >
        <Field label="Token name" hint="Name the device or purpose so you can recognize this token later." className="flex-1">
          <Input name="label" disabled={pending} placeholder="personal laptop, CI" />
        </Field>
        <Field label="Expires at (UTC)" hint="YYYY-MM-DD HH:mm. Leave blank for no expiry.">
          <Input name="expiry" type="text" placeholder="YYYY-MM-DD HH:mm" disabled={pending} />
        </Field>
        <Button className="sm:mt-6" variant="mine" type="submit" disabled={pending}>
          {pending ? "Issuing…" : "Issue token"}
        </Button>
      </form>
      {error ? <p role="alert" className="text-sm text-risk">{error}</p> : null}
      {state.status === "unknown" ? <div><Button type="button" disabled={pending} onClick={() => startTransition(() => router.refresh())}>Refresh list</Button></div> : null}
      {issued && state.status !== "succeeded" ? <p className="text-sm font-medium">Previous token</p> : null}
      {issued ? <p className="text-sm text-quiet">{issued.expiresAt ? "Expires at " + issued.expiresAt.slice(0, 16).replace("T", " ") + " UTC" : "No expiry"}</p> : null}
      {issued ? <TokenReveal token={issued.token} mcpUrl={mcpUrl} /> : null}
    </div>
  );
}

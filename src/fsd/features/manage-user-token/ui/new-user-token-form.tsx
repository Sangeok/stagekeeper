"use client";
import { useState, useTransition, type ReactElement } from "react";
import { useRouter } from "next/navigation";
import { parseTokenExpiryInput } from "@harness/core/token-validity.mjs";

import { TokenReveal } from "@/fsd/entities/project-token";
import type { ActionResult } from "@/fsd/shared/api/result";
import { Button } from "@/fsd/shared/ui/button";
import { Field, Input } from "@/fsd/shared/ui/field";

// 서버 액션은 route가 prop으로 넘긴다 — "use client" 파일은 *.server를 import할 수 없다(fsd.md).
type Props = { issue: (label: string, expiresAt: string | null) => Promise<ActionResult<{ token: string }>>; mcpUrl: string };

// 노출 화면은 프로젝트 토큰과 **같은 컴포넌트**를 쓴다(entities/project-token의 TokenReveal).
// 1회 노출 규약은 토큰 종류와 무관하고, 셸 변수 이름도 HARNESS_TOKEN으로 같다 —
// 사용자 범위 MCP 등록에 들어가는 참조가 `${HARNESS_TOKEN}` 하나이기 때문이다.
// 2·3단계는 그 컴포넌트가 접두(hu_)를 보고 바꾼다: 이 토큰은 머신에 한 번 영구 저장한다.
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
              // requireUser는 로그인이 끊기면 redirect로 throw한다 — try/catch는 그래서 남긴다.
              const result = await issue(label, expiry);
              if (!result.success) {
                setState({ status: "rejected", previous: issued, error: result.error });
                router.refresh();
                return;
              }
              setState({ status: "succeeded", issued: { token: result.data.token, expiresAt: expiry } });
            } catch {
              // The write may have committed. Keep the last received token separate from this unknown result.
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

"use client";
import { useState, useTransition } from "react";

import { TokenReveal } from "@/fsd/entities/project-token";
import type { ActionResult } from "@/fsd/shared/api/result";
import { Button } from "@/fsd/shared/ui/button";
import { Field, Input } from "@/fsd/shared/ui/field";

// 서버 액션은 route가 prop으로 넘긴다 — "use client" 파일은 *.server를 import할 수 없다(fsd.md).
type Props = { issue: (label: string) => Promise<ActionResult<{ token: string }>>; mcpUrl: string; serverUrl: string };

// 노출 화면은 프로젝트 토큰과 **같은 것**을 쓴다(entities/project-token의 TokenReveal).
// 1회 노출 규약은 토큰 종류와 무관하고, 셸 변수 이름도 HARNESS_TOKEN으로 같다 —
// 생성기가 .mcp.json에 쓰는 참조가 `${HARNESS_TOKEN}` 하나이기 때문이다.
export function NewUserTokenForm({ issue, mcpUrl, serverUrl }: Props) {
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
              // requireUser는 로그인이 끊기면 redirect로 throw한다 — try/catch는 그래서 남긴다.
              const result = await issue(label);
              if (!result.success) {
                setError(result.error);
                return;
              }
              setToken(result.data.token);
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
      {token ? <TokenReveal token={token} mcpUrl={mcpUrl} serverUrl={serverUrl} /> : null}
    </div>
  );
}

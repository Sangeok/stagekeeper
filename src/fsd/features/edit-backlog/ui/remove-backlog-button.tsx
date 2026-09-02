"use client";
import { useState, useTransition } from "react";

import { Button } from "@/fsd/shared/ui/button";
import type { RemoveBacklogAction } from "../model/backlog-form-state";

// 표에서 상호작용하는 유일한 조각이라 여기만 Client Component로 남긴다
// (fsd.md 「event handler가 필요한 가장 작은 leaf만」). 표 본체는 서버에서 렌더된다.
//
// try/catch는 new-token-form과 같은 이유로 있다 — requireMember는 여전히 throw한다.
// 여기서 잡지 않으면 행 하나의 실패가 탭 본문 전체를 오류 화면으로 바꾼다. 결재함은
// 카드마다 경계가 있는데(inbox-card-boundary) 백로그에는 그게 없었다.
export function RemoveBacklogButton({ itemKey, remove }: { itemKey: string; remove: RemoveBacklogAction }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        size="sm"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            try {
              const result = await remove(itemKey);
              setError(result.error ?? null);
            } catch {
              setError("Couldn't remove it. Try again.");
            }
          })
        }
      >
        Remove
      </Button>
      {error ? <p className="text-xs text-risk">{error}</p> : null}
    </div>
  );
}

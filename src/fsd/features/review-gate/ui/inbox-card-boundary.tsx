"use client";

import { catchError, type ErrorInfo } from "next/error";

import { cardClass } from "@/fsd/shared/ui/card";
import { Button } from "@/fsd/shared/ui/button";

// 카드 하나의 실패가 결재함 전체를 지우지 않게 한다. 이 경계가 없으면 게이트 동작에서 던져진
// 예외가 p/[slug]/error.tsx까지 올라가 대기 중인 다른 카드까지 사라진다.
// catchError는 redirect()·notFound()를 삼키지 않고, retry()는 경계 밖 Client 상태를 보존한다
// (node_modules/next/dist/docs/01-app/03-api-reference/04-functions/catchError.md).
//
// 여기서는 사용자가 이 항목에 결정을 시도했다는 걸 알 수 있으므로 상위 경계와 달리 원인을 말한다.
// 문구는 product-copy.md §17.
function InboxCardErrorFallback({ itemKey }: { itemKey: string }, { retry }: ErrorInfo) {
  return (
    <article className={cardClass()}>
      <p className="font-mono text-xs text-quiet">{itemKey}</p>
      <p className="text-sm">The decision wasn&apos;t recorded. Try again.</p>
      <div>
        <Button variant="mine" onClick={() => retry()}>
          Try again
        </Button>
      </div>
    </article>
  );
}

export const InboxCardBoundary = catchError(InboxCardErrorFallback);

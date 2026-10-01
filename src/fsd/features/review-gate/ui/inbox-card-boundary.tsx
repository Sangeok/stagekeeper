"use client";

import { catchError, type ErrorInfo } from "next/error";

import { cardClass } from "@/fsd/shared/ui/card";
import { Button } from "@/fsd/shared/ui/button";

// 카드 하나의 실패가 결재함 전체를 지우지 않게 한다. 이 경계가 없으면 게이트 동작에서 던져진
// 예외가 p/[slug]/error.tsx까지 올라가 대기 중인 다른 카드까지 사라진다.
// catchError는 redirect()·notFound()를 삼키지 않고, retry()는 경계 밖 Client 상태를 보존한다
// (node_modules/next/dist/docs/01-app/03-api-reference/04-functions/catchError.md).
//
// 하위 렌더와 action/응답 실패를 모두 받으므로 저장 여부나 실패 원인을 단정하지 않는다.
// 문구는 product-copy.md §17.
function InboxCardErrorFallback({ itemKey }: { itemKey: string }, { retry }: ErrorInfo) {
  return (
    <article className={cardClass()}>
      <p className="font-mono text-xs text-quiet">{itemKey}</p>
      <p className="text-sm">This card couldn&apos;t be loaded. Try again to check the latest Inbox state.</p>
      <div>
        <Button variant="mine" onClick={() => retry()}>
          Try again
        </Button>
      </div>
    </article>
  );
}

export const InboxCardBoundary = catchError(InboxCardErrorFallback);

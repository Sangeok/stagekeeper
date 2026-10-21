"use client";

import { catchError, type ErrorInfo } from "next/error";

import { cardClass } from "@/fsd/shared/ui/card";
import { Button } from "@/fsd/shared/ui/button";

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

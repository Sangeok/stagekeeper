"use client";

import type { ReactElement } from "react";
import { catchError, type ErrorInfo } from "next/error";
import { Button } from "@/fsd/shared/ui/button";
import { SectionLabel } from "@/fsd/shared/ui/section-label";

// Rendering and transport errors cannot tell us whether the transition committed.
// Next's retry re-reads the page without resubmitting the mutation or swallowing redirects.
function ReopenErrorFallback(_props: object, { retry }: ErrorInfo): ReactElement {
  return (
    <section>
      <SectionLabel>Reopen</SectionLabel>
      <p role="alert" className="text-sm">This section couldn&apos;t be loaded. Try again to check the latest item state.</p>
      <Button variant="mine-outline" onClick={() => retry()}>Try again</Button>
    </section>
  );
}

export const ReopenActionsBoundary = catchError(ReopenErrorFallback);

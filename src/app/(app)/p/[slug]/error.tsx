"use client";

import { useEffect } from "react";

import { Button } from "@/fsd/shared/ui/button";

export default function Error({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <section className="flex flex-col gap-2">
      <h1 className="text-2xl font-semibold tracking-tight">Something went wrong.</h1>
      <p className="text-sm text-quiet">
        Try again. If you were approving or sending something back, open the Inbox to check whether it went through.
      </p>
      <div className="mt-1">
        <Button variant="mine" onClick={() => retry()}>
          Try again
        </Button>
      </div>
    </section>
  );
}

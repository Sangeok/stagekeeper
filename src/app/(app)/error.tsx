"use client";

import Link from "next/link";
import { useEffect } from "react";

import { Button } from "@/fsd/shared/ui/button";
import { projectsPath } from "@/fsd/shared/routes/projects";

export default function Error({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="mx-auto flex w-full max-w-[800px] flex-col gap-2 px-5 pt-9 pb-14">
      <h1 className="text-2xl font-semibold tracking-tight">Something went wrong.</h1>
      <p className="text-sm text-quiet">Try again, or go back to your projects.</p>
      <div className="mt-1 flex items-center gap-4">
        <Button variant="mine" onClick={() => retry()}>
          Try again
        </Button>
        <Link href={projectsPath()} className="text-sm underline underline-offset-2">
          All projects
        </Link>
      </div>
    </main>
  );
}

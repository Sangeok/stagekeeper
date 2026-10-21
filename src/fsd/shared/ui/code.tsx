import type { HTMLAttributes } from "react";

import { cn } from "@/fsd/shared/lib/class-name";

export function Code({ className, ...rest }: HTMLAttributes<HTMLElement>) {
  return <code className={cn("font-mono text-[0.92em]", className)} {...rest} />;
}

export function CodeBlock({ className, ...rest }: HTMLAttributes<HTMLElement>) {
  return (
    <code
      className={cn(
        "block overflow-x-auto rounded-md border border-rule bg-field px-2.5 py-2 font-mono text-xs leading-4",
        className,
      )}
      {...rest}
    />
  );
}

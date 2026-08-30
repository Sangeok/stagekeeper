import type { HTMLAttributes } from "react";

import { cn } from "@/fsd/shared/lib/class-name";

// 기계가 만든 식별자·경로·명령은 mono. 인라인은 바탕 없이, 블록은 field 바탕 위에.
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

import type { HTMLAttributes } from "react";

import { cn } from "@/fsd/shared/lib/class-name";

export function SectionLabel({ className, ...rest }: HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h2
      className={cn("mb-2.5 text-[11px] font-medium uppercase leading-4 tracking-[0.06em] text-quiet", className)}
      {...rest}
    />
  );
}

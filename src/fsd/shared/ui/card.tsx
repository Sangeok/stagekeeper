import type { HTMLAttributes } from "react";

import { cn } from "@/fsd/shared/lib/class-name";

export function cardClass({ decision = false, className }: { decision?: boolean; className?: string } = {}): string {
  return cn(
    "flex flex-col gap-3 rounded-lg border bg-paper px-[18px] pt-[18px] pb-4",
    decision ? "border-edge" : "border-rule",
    className,
  );
}

type Props = HTMLAttributes<HTMLDivElement> & { decision?: boolean };

export function Card({ decision = false, className, ...rest }: Props) {
  return <div className={cardClass({ decision, className })} {...rest} />;
}

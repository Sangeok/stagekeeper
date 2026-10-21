import type { HTMLAttributes } from "react";

import { cn } from "@/fsd/shared/lib/class-name";

export type ChipTone = "record" | "mine" | "risk" | "done";

const TONE: Record<ChipTone, string> = {
  record: "border-rule bg-paper text-ink",
  mine: "border-mine-soft bg-mine-soft text-mine",
  risk: "border-risk-soft bg-risk-soft text-risk",
  done: "border-rule bg-transparent text-quiet",
};

type Props = HTMLAttributes<HTMLSpanElement> & { tone?: ChipTone };

export function Chip({ tone = "done", className, ...rest }: Props) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2 text-xs leading-4",
        TONE[tone],
        className,
      )}
      {...rest}
    />
  );
}

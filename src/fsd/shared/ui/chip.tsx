import type { HTMLAttributes } from "react";

import { cn } from "@/fsd/shared/lib/class-name";

// record = 에이전트가 남긴 기록(조용함), mine = 사람이 방금 한 결정, risk = 부재·위험, done = 상태 라벨.
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

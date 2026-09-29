import type { HTMLAttributes } from "react";

import { cn } from "@/fsd/shared/lib/class-name";

// record = 에이전트가 남긴 기록(조용함), mine = 사람이 방금 한 결정, risk = 되돌릴 수 없는 결과, done = 상태 라벨.
// 무언가가 없다는 사실(검증 기록 없음 등)은 risk가 아니다 — done으로 조용히 말한다(design.md 규칙 2).
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

import type { HTMLAttributes } from "react";

import { cn } from "@/fsd/shared/lib/class-name";

// 카드는 paper, 페이지는 ground — 층은 톤 차이로 생기고 그림자는 없다.
// decision = 사람의 결정을 기다리는 카드. 테두리만 한 단계 진하다.
export function cardClass(decision = false, className?: string): string {
  return cn(
    "flex flex-col gap-3 rounded-lg border bg-paper px-[18px] pt-[18px] pb-4",
    decision ? "border-edge" : "border-rule",
    className,
  );
}

type Props = HTMLAttributes<HTMLDivElement> & { decision?: boolean };

export function Card({ decision = false, className, ...rest }: Props) {
  return <div className={cardClass(decision, className)} {...rest} />;
}

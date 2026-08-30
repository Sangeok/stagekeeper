import type { HTMLAttributes, TableHTMLAttributes, TdHTMLAttributes, ThHTMLAttributes } from "react";

import { cn } from "@/fsd/shared/lib/class-name";

// 표는 paper 한 덩어리 안에 산다. 넓으면 표 자체가 가로 스크롤한다 — 페이지는 절대 옆으로 밀리지 않는다.
export function Table({ className, ...rest }: TableHTMLAttributes<HTMLTableElement>) {
  return (
    <div className="overflow-x-auto rounded-lg border border-rule bg-paper">
      <table className={cn("w-full text-left text-sm", className)} {...rest} />
    </div>
  );
}

export function Th({ className, ...rest }: ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      className={cn(
        "border-b border-rule px-3.5 py-2 text-[11px] font-medium uppercase tracking-[0.06em] text-quiet",
        className,
      )}
      {...rest}
    />
  );
}

export function Td({ className, ...rest }: TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cn("px-3.5 py-2.5 align-top", className)} {...rest} />;
}

export function Tr({ className, ...rest }: HTMLAttributes<HTMLTableRowElement>) {
  return <tr className={cn("border-b border-rule last:border-b-0", className)} {...rest} />;
}

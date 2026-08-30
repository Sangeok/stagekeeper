import type { InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from "react";

import { cn } from "@/fsd/shared/lib/class-name";

// 입력칸 하나 = 레이블 · 칸 · 도움말. 안내는 placeholder가 아니라 도움말에 둔다(입력하면 placeholder는 사라진다).
export const INPUT_CLASS =
  "w-full rounded-md border border-edge bg-paper px-2.5 py-[7px] text-sm leading-5 text-ink " +
  "placeholder:text-quiet disabled:opacity-50";

export function Input({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(INPUT_CLASS, className)} {...rest} />;
}

export function Textarea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(INPUT_CLASS, className)} {...rest} />;
}

export function Field({
  label,
  optional = false,
  hint,
  children,
  className,
}: {
  label: ReactNode;
  optional?: boolean;
  hint?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={cn("flex flex-col gap-1", className)}>
      <span className="text-sm font-medium">
        {label}
        {optional ? <span className="ml-1.5 text-xs font-normal text-quiet">optional</span> : null}
      </span>
      {children}
      {hint ? <span className="text-xs text-quiet">{hint}</span> : null}
    </label>
  );
}

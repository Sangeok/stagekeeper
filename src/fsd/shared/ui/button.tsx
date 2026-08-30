import Link from "next/link";
import type { ButtonHTMLAttributes, ComponentProps } from "react";

import { cn } from "@/fsd/shared/lib/class-name";

// 버튼 네 벌. mine = 지금 기다리는 결정(채움), mine-outline = 할 수는 있지만 재촉하지 않는 것,
// quiet = 보조, risk = 되돌릴 수 없는 것. 색은 사람 동작에만 있다.
export type ButtonVariant = "mine" | "mine-outline" | "quiet" | "risk";
export type ButtonSize = "md" | "sm";

const BASE =
  "inline-flex items-center justify-center gap-2 rounded-md border font-medium transition-colors " +
  "disabled:cursor-default disabled:opacity-50";

const VARIANT: Record<ButtonVariant, string> = {
  mine: "border-mine bg-mine text-on-mine hover:brightness-95",
  "mine-outline": "border-mine bg-paper text-mine hover:bg-mine-soft",
  quiet: "border-edge bg-paper text-ink hover:bg-field",
  risk: "border-risk bg-paper text-risk hover:bg-risk-soft",
};

const SIZE: Record<ButtonSize, string> = {
  md: "px-3 py-[7px] text-sm leading-5",
  sm: "px-2.5 py-1 text-xs leading-4",
};

export function buttonClass(variant: ButtonVariant, size: ButtonSize = "md", className?: string): string {
  return cn(BASE, VARIANT[variant], SIZE[size], className);
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
};

export function Button({ variant = "quiet", size = "md", className, type = "button", ...rest }: ButtonProps) {
  return <button type={type} className={buttonClass(variant, size, className)} {...rest} />;
}

type ButtonLinkProps = ComponentProps<typeof Link> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
};

export function ButtonLink({ variant = "quiet", size = "md", className, ...rest }: ButtonLinkProps) {
  return <Link className={buttonClass(variant, size, className)} {...rest} />;
}

// 외부 주소(GitHub 계획서 등)로 새 탭을 여는 버튼 모양 링크.
type ExternalButtonLinkProps = ComponentProps<"a"> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
};

export function ExternalButtonLink({ variant = "quiet", size = "md", className, ...rest }: ExternalButtonLinkProps) {
  return <a target="_blank" rel="noreferrer" className={buttonClass(variant, size, className)} {...rest} />;
}

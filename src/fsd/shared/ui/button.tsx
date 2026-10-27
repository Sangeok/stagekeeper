import Link from "next/link";
import type { ComponentProps } from "react";

import { cn } from "@/fsd/shared/lib/class-name";

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

type ButtonProps = ComponentProps<"button"> & {
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

type ExternalButtonLinkProps = ComponentProps<"a"> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
};

export function ExternalButtonLink({ variant = "quiet", size = "md", className, ...rest }: ExternalButtonLinkProps) {
  return <a target="_blank" rel="noreferrer" className={buttonClass(variant, size, className)} {...rest} />;
}

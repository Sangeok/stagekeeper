"use client";

import { useRef, useState, type ReactElement } from "react";

import { Button, type ButtonSize, type ButtonVariant } from "./button";

export function CopyButton({
  text,
  variant = "quiet",
  size = "sm",
  className,
}: {
  text: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
}): ReactElement {
  const [copiedText, setCopiedText] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const writing = useRef(false);
  return (
    <Button
      variant={variant}
      size={size}
      className={className}
      disabled={pending}
      onClick={async () => {
        if (writing.current) return;
        writing.current = true;
        setPending(true);
        const clickedText = text;
        try {
          await navigator.clipboard.writeText(clickedText);
          setCopiedText(clickedText);
        } catch (error) {
          setCopiedText(null);
          console.error("clipboard write failed", error);
        } finally {
          writing.current = false;
          setPending(false);
        }
      }}
    >
      {copiedText === text ? "Copied" : "Copy"}
    </Button>
  );
}

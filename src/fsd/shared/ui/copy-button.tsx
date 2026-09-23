"use client";

import { useState } from "react";

import { Button, type ButtonSize, type ButtonVariant } from "./button";

// 한 줄을 클립보드로. 못 쓰는 브라우저에서는 라벨이 바뀌지 않는다 — 직접 선택해 복사하면 된다.
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
}) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      variant={variant}
      size={size}
      className={className}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
        } catch (error) {
          // 사용자에게는 선택 가능한 텍스트가 fallback이다(위 주석). 원인(비보안 origin, 권한 거부)은 콘솔에 남긴다 —
          // 복사할 텍스트는 로그에 싣지 않는다(토큰일 수 있다).
          setCopied(false);
          console.error("clipboard write failed", error);
        }
      }}
    >
      {copied ? "Copied" : "Copy"}
    </Button>
  );
}

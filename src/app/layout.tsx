import type { Metadata } from "next";
import localFont from "next/font/local";
import { Toaster } from "sonner";
import "./globals.css";

// 사람이 읽는 글은 Schibsted Grotesk(400–900), 기계가 만든 식별자는 Fragment Mono(400뿐).
const sans = localFont({
  src: "./fonts/schibsted-grotesk-normal.ttf",
  variable: "--font-schibsted",
  weight: "400 900",
  style: "normal",
  display: "swap",
});

const mono = localFont({
  src: "./fonts/fragment-mono-regular.ttf",
  variable: "--font-fragment",
  weight: "400",
  style: "normal",
  display: "swap",
  adjustFontFallback: false,
});

export const metadata: Metadata = {
  title: "Stagekeeper",
  description: "Agent development pipeline with human approval gates.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col bg-ground text-ink">
        {children}
        {/* 게이트·되돌리기 피드백은 toast로 나간다 — 마운트가 없으면 조용히 아무것도 안 보인다. */}
        <Toaster theme="system" />
      </body>
    </html>
  );
}

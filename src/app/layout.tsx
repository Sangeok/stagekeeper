import type { Metadata } from "next";
import { Fragment_Mono, Schibsted_Grotesk } from "next/font/google";
import { Toaster } from "sonner";
import "./globals.css";

// 사람이 읽는 글은 Schibsted Grotesk(가변 서체라 weight 지정 없음), 기계가 만든 식별자는 Fragment Mono(400뿐).
const sans = Schibsted_Grotesk({
  variable: "--font-schibsted",
  subsets: ["latin"],
});

const mono = Fragment_Mono({
  variable: "--font-fragment",
  subsets: ["latin"],
  weight: "400",
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

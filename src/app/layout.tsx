import type { Metadata } from "next";
import localFont from "next/font/local";
import { Toaster } from "sonner";
import { siteUrl } from "@/server/public-url";
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

// 공유 카드 이미지는 opengraph-image.tsx가, og:title·og:description은 Next가 각 페이지의 제목·설명에서 채운다.
// 색인은 닫힌 쪽이 기본이고 공개 랜딩(page.tsx)만 연다 — 공개 경로를 목록으로 여는 proxy와 같은 방향이다.
export const metadata: Metadata = {
  metadataBase: siteUrl(),
  title: "Stagekeeper",
  description: "Agent development pipeline with human approval gates.",
  openGraph: { siteName: "Stagekeeper", type: "website" },
  robots: { index: false, follow: false },
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

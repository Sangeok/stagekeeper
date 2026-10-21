import type { Metadata } from "next";
import localFont from "next/font/local";
import { Toaster } from "sonner";
import { siteUrl } from "@/server/public-url";
import "./globals.css";

const sans = localFont({
  src: "./_fonts/schibsted-grotesk-normal.ttf",
  variable: "--font-schibsted",
  weight: "400 900",
  style: "normal",
  display: "swap",
});

const mono = localFont({
  src: "./_fonts/fragment-mono-regular.ttf",
  variable: "--font-fragment",
  weight: "400",
  style: "normal",
  display: "swap",
  adjustFontFallback: false,
});

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
        <Toaster theme="system" />
      </body>
    </html>
  );
}

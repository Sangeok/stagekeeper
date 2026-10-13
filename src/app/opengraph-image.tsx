import { ImageResponse } from "next/og";
import { LANDING_SHARE_ALT, LandingShareCard } from "@/fsd/pages/landing";
import { imageFonts } from "./fonts/image-fonts";

// 링크 공유 카드. 루트에 두어 모든 경로가 물려받는다 — 비공개 링크도 /login으로 넘어가 같은 카드를 보인다.
// X(twitter:image)는 Next가 이 이미지로 채우고 카드 종류도 summary_large_image로 정한다.
export const alt = LANDING_SHARE_ALT;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OpenGraphImage() {
  return new ImageResponse(<LandingShareCard />, { ...size, fonts: await imageFonts() });
}

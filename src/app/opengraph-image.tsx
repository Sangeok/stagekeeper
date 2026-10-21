import { ImageResponse } from "next/og";
import { LANDING_SHARE_ALT, LandingShareCard } from "@/fsd/pages/landing";
import { imageFonts } from "./_fonts/image-fonts";

export const alt = LANDING_SHARE_ALT;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OpenGraphImage() {
  return new ImageResponse(<LandingShareCard />, { ...size, fonts: await imageFonts() });
}

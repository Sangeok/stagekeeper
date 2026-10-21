import { ImageResponse } from "next/og";
import { Monogram } from "@/fsd/shared/ui/monogram";
import { imageFonts } from "./_fonts/image-fonts";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default async function AppleIcon() {
  return new ImageResponse(<Monogram size={size.width} radius={0} />, { ...size, fonts: await imageFonts() });
}

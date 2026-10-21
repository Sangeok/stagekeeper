import { ImageResponse } from "next/og";
import { Monogram } from "@/fsd/shared/ui/monogram";
import { imageFonts } from "./_fonts/image-fonts";

export const size = { width: 96, height: 96 };
export const contentType = "image/png";

export default async function Icon() {
  return new ImageResponse(<Monogram size={size.width} radius={20} />, { ...size, fonts: await imageFonts() });
}

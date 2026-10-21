import { ImageResponse } from "next/og";
import { Monogram } from "@/fsd/shared/ui/monogram";
import { imageFonts } from "./_fonts/image-fonts";

// iOS 홈 화면 아이콘. iOS가 모서리를 직접 깎고 투명한 곳은 검게 칠하므로 꽉 찬 사각형으로 그린다.
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default async function AppleIcon() {
  return new ImageResponse(<Monogram size={size.width} radius={0} />, { ...size, fonts: await imageFonts() });
}

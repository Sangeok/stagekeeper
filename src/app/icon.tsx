import { ImageResponse } from "next/og";
import { Monogram } from "@/fsd/shared/ui/monogram";
import { imageFonts } from "./fonts/image-fonts";

// 브라우저 탭·검색 결과의 아이콘. 96px은 검색 결과가 권하는 48px을 넘고, 탭의 16·32px로 정수배 축소된다.
export const size = { width: 96, height: 96 };
export const contentType = "image/png";

export default async function Icon() {
  return new ImageResponse(<Monogram size={size.width} radius={20} />, { ...size, fonts: await imageFonts() });
}

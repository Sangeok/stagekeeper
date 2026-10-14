import { readFile } from "node:fs/promises";
import { join } from "node:path";

// next/og 이미지(공유 카드·앱 아이콘)가 쓰는 글꼴. next/og는 가변 글꼴의 굵기 축을 적용하지 못해
// schibsted-grotesk-normal.ttf를 주면 600을 요청해도 400으로 그린다 — 그래서 같은 패밀리의 정적 SemiBold를 읽는다.
// 세 이미지 모두 빌드 때 한 번 그려지는 정적 파일이라 요청 시에는 읽지 않는다.
export async function imageFonts() {
  const semiBold = await readFile(join(process.cwd(), "src/app/fonts/schibsted-grotesk-semibold.ttf"));
  return [{ name: "Schibsted Grotesk", data: semiBold, style: "normal" as const, weight: 600 as const }];
}

import { LIGHT_PALETTE } from "@/fsd/shared/config/light-palette";

// 제품 표식 — --mine 칸에 S 한 글자. 앱 아이콘과 공유 카드가 next/og로 그리므로 className이 아니라
// 인라인 style이고 색은 라이트 토큰 값이다. 글꼴은 그리는 쪽이 넘기는 SemiBold(src/app/_fonts/image-fonts.ts)다.
// radius는 부르는 쪽이 정한다: 브라우저 아이콘은 둥글게, apple-icon은 iOS가 모서리를 깎으므로 0.
export function Monogram({ size, radius }: { size: number; radius: number }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        background: LIGHT_PALETTE.mine,
        color: LIGHT_PALETTE["on-mine"],
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: size * 0.7,
        fontWeight: 600,
        lineHeight: 1,
      }}
    >
      S
    </div>
  );
}

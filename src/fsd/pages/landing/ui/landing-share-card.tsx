import { LIGHT_PALETTE } from "@/fsd/shared/config/light-palette";
import { Monogram } from "@/fsd/shared/ui/monogram";

import { HEADLINE } from "../model/landing-copy";

// 링크를 붙여넣었을 때 보이는 공유 카드(1200×630, src/app/opengraph-image.tsx가 next/og로 그린다).
// 랜딩 히어로를 옮긴 것이라 볼드니스도 같다: 헤드라인 한 문장(둘째 줄만 --mine)과 데모 카드 머리의 --mine 띠뿐.
// next/og는 여러 자식을 가진 div에 display:flex를 요구하고 className을 읽지 못한다 — 인라인 style만 쓴다.
export const LANDING_SHARE_ALT = `Stagekeeper — ${HEADLINE.agents} ${HEADLINE.you}`;

// next/og는 이 글꼴에서 "You"·"Your" 뒤 단어 간격을 브라우저보다 넓게 띄운다(브라우저 렌더와 나란히 비교해 확인).
// 줄 안의 공백을 NBSP로 바꾸면 한 줄이 한 덩어리로 놓여 간격이 고르다. 두 줄 다 이 크기에서 넘치지 않아 잃는 줄바꿈도 없다.
const oneRun = (line: string) => line.replaceAll(" ", " ");

export function LandingShareCard() {
  return (
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: LIGHT_PALETTE.ground }}>
      <div style={{ height: 8, background: LIGHT_PALETTE.mine }} />
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "72px 88px 84px",
          color: LIGHT_PALETTE.ink,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <Monogram size={56} radius={12} />
          <div style={{ fontSize: 36, letterSpacing: -0.4 }}>Stagekeeper</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", fontSize: 96, lineHeight: 1.02, letterSpacing: -2.9 }}>
          <div>{oneRun(HEADLINE.agents)}</div>
          <div style={{ color: LIGHT_PALETTE.mine }}>{oneRun(HEADLINE.you)}</div>
        </div>
      </div>
    </div>
  );
}

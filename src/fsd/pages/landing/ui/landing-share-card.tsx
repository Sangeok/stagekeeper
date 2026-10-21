import { LIGHT_PALETTE } from "@/fsd/shared/config/light-palette";
import { Monogram } from "@/fsd/shared/ui/monogram";

import { HEADLINE } from "../model/landing-copy";

export const LANDING_SHARE_ALT = `Stagekeeper — ${HEADLINE.agents} ${HEADLINE.you}`;

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

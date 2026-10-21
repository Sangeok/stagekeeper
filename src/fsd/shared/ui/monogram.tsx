import { LIGHT_PALETTE } from "@/fsd/shared/config/light-palette";

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

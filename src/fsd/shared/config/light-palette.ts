// next/og가 그리는 이미지(앱 아이콘·공유 카드)용 색. next/og는 CSS 변수를 읽지 못해서 globals.css :root(라이트)의
// 토큰 값을 그대로 적는다. 이미지에는 다크 모드가 없으므로 라이트 값만 둔다. 갈라지면 light-palette.test.ts가 잡는다.
export const LIGHT_PALETTE = {
  ground: "#fbfaf8",
  ink: "#1d1a17",
  mine: "#1a51bd",
  "on-mine": "#ffffff",
} as const;

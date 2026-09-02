// "이 계획서는 검증을 통과했는가" — 사람의 승인(게이트②)을 좌우하는 술어다.
// 예전에는 status === "in_review" && validation !== null 이 세 레이어 여섯 곳에 흩어져 있어서,
// 정의가 바뀌면 배너는 "승인 준비됨"이라 하고 카드는 "No validation yet"이라 하는 상태가 될 수 있었다.
// 가장 아래 레이어에 두어 widgets·pages·features가 모두 같은 답을 쓴다.
export function isPlanVerified(status: string | null, validation: string | null): boolean {
  return status === "in_review" && validation !== null;
}

// 검토 중인데 아직 검증 기록이 없는 것 — 승인 전에 검증부터 돌려야 한다.
export function isPlanUnverified(status: string | null, validation: string | null): boolean {
  return status === "in_review" && validation === null;
}

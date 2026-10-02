// "이 계획서에 검증 기록이 있는가" — 카드가 Verified와 Not verified 중 무엇을 보일지 정하는 술어다.
// 가장 아래 레이어에 두어 widgets·pages·features가 모두 같은 답을 쓴다. 기록이 없는 것은 정보일 뿐
// 승인을 막거나 경고할 이유가 아니다(design.md 규칙 2) — 그래서 "미검증" 술어는 따로 두지 않는다.
export function isPlanVerified(status: string | null, validation: string | null): boolean {
  return status === "in_review" && validation !== null;
}

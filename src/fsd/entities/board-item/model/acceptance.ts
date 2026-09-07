// "이 항목은 인수를 기다리는가" — done이지만 인수 기록(acceptedAt)이 없다. verification.ts와 같은 이유로
// 가장 아래 레이어에 둔다: 배너·항목 상세·journey가 같은 답을 쓴다. done은 "dev가 끝났다고 보고했다"이고
// 인수는 main-loop의 report_submit이 찍는 acceptedAt이다(protocol.md 「인수 다섯 조건」).
export function isAwaitingAcceptance(status: string | null, accepted: boolean): boolean {
  return status === "done" && !accepted;
}

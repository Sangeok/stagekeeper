// 순수. 날짜 사이의 "며칠 전"과 짧은 날짜. UTC 달력일로 센다 — 보드의 경과일 표시와 같은 시계.

const DAY_MS = 86_400_000;

// 항목 머리와 이력 행은 시간대 변환 없이 같은 UTC 분을 보여 준다.
export function utcMinute(date: Date): string {
  return date.toISOString().slice(0, 16).replace("T", " ");
}

function utcDay(date: Date): number {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

// 달력일 차이. 미래는 0으로 깎는다.
export function daysBetween(from: Date, to: Date): number {
  const diff = Math.floor((utcDay(to) - utcDay(from)) / DAY_MS);
  return diff < 0 ? 0 : diff;
}

// "today" · "1 day ago" · "N days ago"
export function agoLabel(from: Date, now: Date): string {
  const days = daysBetween(from, now);
  if (days === 0) return "today";
  if (days === 1) return "1 day ago";
  return `${days} days ago`;
}

// "Aug 28" — UTC 기준, 영어 고정(제품 언어).
export function shortDate(date: Date): string {
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

const DAY_MS = 86_400_000;

export function utcMinute(date: Date): string {
  return date.toISOString().slice(0, 16).replace("T", " ");
}

function utcDay(date: Date): number {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

export function daysBetween(from: Date, to: Date): number {
  const diff = Math.floor((utcDay(to) - utcDay(from)) / DAY_MS);
  return diff < 0 ? 0 : diff;
}

export function agoLabel(from: Date, now: Date): string {
  const days = daysBetween(from, now);
  if (days === 0) return "today";
  if (days === 1) return "1 day ago";
  return `${days} days ago`;
}

export function shortDate(date: Date): string {
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

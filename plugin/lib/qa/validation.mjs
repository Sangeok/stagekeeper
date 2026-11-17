export function qaText(value, name, limit = 2000) {
  if (typeof value !== "string" || !value.trim() || value.length > limit) throw new Error(`${name}: nonempty string required (max ${limit})`);
  return value.trim();
}

export function qaHttpUrl(value, name) {
  const url = new URL(qaText(value, name));
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error(`${name}: plain HTTP(S) URL required`);
  return url.href.replace(/\/$/, "");
}

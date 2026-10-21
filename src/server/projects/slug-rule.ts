export const SLUG_MAX = 40;
export const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,39}$/;

export const RESERVED_SLUGS = new Set(["new"]);

export const REPO_SEGMENT = /^[A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9_-])?$/;

export function slugCandidate(repo: string): string | null {
  const folded = repo
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, SLUG_MAX);
  return SLUG_RE.test(folded) && !RESERVED_SLUGS.has(folded) ? folded : null;
}

export function availableSlug(repo: string, taken: ReadonlySet<string>, fallback = "project"): string {
  const base = slugCandidate(repo) ?? fallback;
  if (!taken.has(base)) return base;
  for (let n = 2; n < 1000; n += 1) {
    const suffixed = `${base.slice(0, SLUG_MAX - String(n).length - 1)}-${n}`;
    if (!taken.has(suffixed)) return suffixed;
  }
  throw new Error(`could not derive a free slug for ${repo}`);
}

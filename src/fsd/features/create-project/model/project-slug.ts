export const SLUG_MAX = 40;
export const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,39}$/;

export const RESERVED_SLUGS = new Set(["new"]);

export const SLUG_HINT = `Becomes /p/<slug>. Lowercase letters, numbers, and dashes, 2–${SLUG_MAX} characters.`;
export const SLUG_ERROR = `Slug must be 2–${SLUG_MAX} lowercase letters, numbers, or dashes.`;

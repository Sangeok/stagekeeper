import { SLUG_MAX } from "@harness/core/project-slug.mjs";

export { SLUG_MAX, SLUG_RE, RESERVED_SLUGS } from "@harness/core/project-slug.mjs";

export const SLUG_HINT = `Becomes /p/<slug>. Lowercase letters, numbers, and dashes, 2–${SLUG_MAX} characters.`;
export const SLUG_ERROR = `Slug must be 2–${SLUG_MAX} lowercase letters, numbers, or dashes.`;

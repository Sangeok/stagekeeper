export const SEGMENT = /^[A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9_-])?$/;

const PATTERNS = [
  /^git@github\.com:([^/]+)\/([^/]+?)(?:\.git)?\/?$/i,
  /^(?:https?:\/\/)?(?:www\.)?github\.com\/([^/]+)\/([^/]+?)(?:\.git)?(?:\/.*)?$/i,
  /^([^/\s.]+)\/([^/\s]+?)(?:\.git)?\/?$/,
];

/** @param {unknown} input @returns {{ owner: string, repo: string } | null} */
export function parseRepoUrl(input) {
  if (typeof input !== "string") return null;
  const text = input.trim().replace(/[?#].*$/, "");
  if (text === "") return null;
  for (const pattern of PATTERNS) {
    const match = pattern.exec(text);
    const owner = match?.[1];
    const repo = match?.[2];
    if (owner && repo && SEGMENT.test(owner) && SEGMENT.test(repo)) return { owner, repo };
  }
  return null;
}

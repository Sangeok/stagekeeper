/** @param {string} value */
function encodePathSegments(value) {
  return value.split("/").map(encodeURIComponent).join("/");
}

/**
 * @param {{ owner: string, repo: string, branch: string }} repo
 * @param {string} path
 * @param {string | null} ref
 * @returns {string}
 */
export function blobHref(repo, path, ref = null) {
  return `https://github.com/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.repo)}/blob/${encodePathSegments(ref ?? repo.branch)}/${encodePathSegments(path)}`;
}

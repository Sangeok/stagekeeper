export const DOCS_PATHS = {
  overview: "/docs",
  "getting-started": "/docs/getting-started",
  automation: "/docs/automation",
  "approval-gates": "/docs/approval-gates",
  security: "/docs/security",
} as const;

export type DocsId = keyof typeof DOCS_PATHS;

export function docsPath(id: DocsId): string {
  return DOCS_PATHS[id];
}

import { docsPath, type DocsId } from "@/fsd/shared/routes/docs";

type DocsPage = {
  id: DocsId;
  path: string;
  nav: string;
  title: string;
  description: string;
};

// 탐색·이전/다음·sitemap·문구 잠금이 이 순서를 함께 따른다.
export const DOCS_PAGES = [
  {
    id: "overview",
    path: docsPath("overview"),
    nav: "Overview",
    title: "Stagekeeper docs — Claude Code pipeline with approval gates",
    description: "Learn how Stagekeeper connects Claude Code to a development pipeline, approval gates, and records in your own repository.",
  },
  {
    id: "getting-started",
    path: docsPath("getting-started"),
    nav: "Get started",
    title: "Get started",
    description: "Connect a repository to Stagekeeper, install the Claude Code plugin, and run your first backlog item.",
  },
  {
    id: "automation",
    path: docsPath("automation"),
    nav: "Automation",
    title: "Run Claude Code on your backlog",
    description: "See what Claude Code runs automatically, where your pipeline waits, and how picking, scouting, and acceptance work.",
  },
  {
    id: "approval-gates",
    path: docsPath("approval-gates"),
    nav: "Approval gates",
    title: "Approval gates for Claude Code",
    description: "Choose where Claude Code waits for approval, edit pipelines, and open gates in the Inbox or from your own session.",
  },
  {
    id: "security",
    path: docsPath("security"),
    nav: "Security",
    title: "MCP tokens and agent permissions",
    description: "Understand project, user, and owner tokens, their permissions, expiry, revocation, and where Stagekeeper stores records.",
  },
] as const satisfies readonly DocsPage[];

export function getDocsPage(id: DocsId): DocsPage {
  const page = DOCS_PAGES.find((entry) => entry.id === id);
  if (!page) throw new Error(`Unknown docs page: ${id}`);
  return page;
}

import type { Metadata } from "next";

import type { DocsId } from "@/fsd/shared/routes/docs";

import { getDocsPage } from "./docs-pages";

export function docsMetadata(id: DocsId): Metadata {
  const page = getDocsPage(id);
  return {
    title: id === "overview" ? { absolute: page.title } : page.title,
    description: page.description,
    alternates: { canonical: page.path },
  };
}

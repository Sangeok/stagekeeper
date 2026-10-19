import type { MetadataRoute } from "next";

import { DOCS_PAGES } from "@/fsd/pages/docs";
import { siteUrl } from "@/server/public-url";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = siteUrl();
  return ["/", ...DOCS_PAGES.map((page) => page.path)].map((pathname) => ({
    url: new URL(pathname, base).href,
  }));
}

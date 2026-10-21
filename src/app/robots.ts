import type { MetadataRoute } from "next";
import { siteUrl } from "@/server/public-url";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", disallow: "/api/" },
    sitemap: new URL("/sitemap.xml", siteUrl()).href,
  };
}

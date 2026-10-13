import type { MetadataRoute } from "next";

// 비공개 화면은 막지 않는다. 막으면 크롤러가 /login 리다이렉트와 noindex를 보지 못해 바깥 링크만으로 URL이
// 색인될 수 있다 — 거기서는 noindex(layout.tsx)가 지킨다. /api는 사람이 읽는 화면이 아니다.
export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: "*", disallow: "/api/" } };
}

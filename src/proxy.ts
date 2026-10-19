import NextAuth from "next-auth";
import { authConfigBase } from "@/server/auth/config.base";

export const proxy = NextAuth(authConfigBase).auth;
// 제외 목록: /api(자체 토큰 검사), 정적 산출물, 그리고 세션 없이 읽히는 메타데이터 파일 —
// 크롤러와 링크 미리보기가 robots.txt·아이콘·공유 카드를 받으러 왔다가 /login으로 튕기지 않게 한다.
export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|robots.txt|icon|apple-icon|opengraph-image|sitemap\\.xml$).*)"],
};

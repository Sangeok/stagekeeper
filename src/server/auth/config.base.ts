import type { NextAuthConfig } from "next-auth";

// 공개 경로. "/"(랜딩)는 **정확 일치**만 — startsWith("/")로 검사하면 모든 경로가 공개된다.
const PUBLIC_EXACT = new Set(["/"]);
const PUBLIC_PREFIXES = ["/login"];
// 로그인 뒤 도착지. 랜딩이 "/"를 차지하므로 프로젝트 목록은 /projects다.
export const AFTER_SIGN_IN = "/projects";

export const authConfigBase = {
  providers: [],
  session: { strategy: "jwt", maxAge: 60 * 60 * 8 },
  pages: { signIn: "/login" },
  callbacks: {
    // matcher가 /login을 포함하므로 미인증 /login은 true(무한 리다이렉트 방지 — ApcH config.edge 주석과 같은 이유).
    // 랜딩은 로그인해도 머문다 — CTA가 "Open projects"로 바뀔 뿐이다.
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const { pathname } = nextUrl;
      if (PUBLIC_EXACT.has(pathname)) return true;
      if (PUBLIC_PREFIXES.some((r) => pathname.startsWith(r))) {
        return isLoggedIn ? Response.redirect(new URL(AFTER_SIGN_IN, nextUrl)) : true;
      }
      return isLoggedIn;
    },
  },
} satisfies NextAuthConfig;

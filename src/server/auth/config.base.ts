import type { NextAuthConfig } from "next-auth";

const PUBLIC_ROUTES = ["/login"];

export const authConfigBase = {
  providers: [],
  session: { strategy: "jwt", maxAge: 60 * 60 * 8 },
  pages: { signIn: "/login" },
  callbacks: {
    // matcher가 /login을 포함하므로 미인증 /login은 true(무한 리다이렉트 방지 — ApcH config.edge 주석과 같은 이유).
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const isPublic = PUBLIC_ROUTES.some((r) => nextUrl.pathname.startsWith(r));
      if (isPublic) return isLoggedIn ? Response.redirect(new URL("/", nextUrl)) : true;
      return isLoggedIn;
    },
  },
} satisfies NextAuthConfig;

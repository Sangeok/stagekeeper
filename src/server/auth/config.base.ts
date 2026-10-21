import type { NextAuthConfig } from "next-auth";

export const PUBLIC_EXACT = new Set([
  "/",
  "/docs",
  "/docs/getting-started",
  "/docs/automation",
  "/docs/approval-gates",
  "/docs/security",
]);
export const PUBLIC_PREFIXES = ["/login"];
export const AFTER_SIGN_IN = "/projects";

export const authConfigBase = {
  providers: [],
  session: { strategy: "jwt", maxAge: 60 * 60 * 8 },
  pages: { signIn: "/login" },
  callbacks: {
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

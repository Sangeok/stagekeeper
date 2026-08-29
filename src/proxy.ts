// src/proxy.ts — Next 16: middleware → proxy(Node 런타임). /api/*는 자기 인증(MCP는 Bearer, auth는 Auth.js).
import NextAuth from "next-auth";
import { authConfigBase } from "@/server/auth/config.base";

export const proxy = NextAuth(authConfigBase).auth;
export const config = { matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"] };

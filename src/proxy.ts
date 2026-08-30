import NextAuth from "next-auth";
import { authConfigBase } from "@/server/auth/config.base";

export const proxy = NextAuth(authConfigBase).auth;
export const config = { matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"] };

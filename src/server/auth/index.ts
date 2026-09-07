// index.ts
import "server-only";
import NextAuth from "next-auth";
import { cache } from "react";
import { authConfig } from "./config";

const { auth: uncachedAuth, handlers, signIn } = NextAuth(authConfig);
export const auth = cache(uncachedAuth);
export { handlers, signIn };

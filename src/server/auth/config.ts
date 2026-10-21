import type { NextAuthConfig } from "next-auth";
import GitHub from "next-auth/providers/github";
import { prisma } from "@/server/db";
import { authConfigBase } from "./config.base";

export const authConfig = {
  ...authConfigBase,
  providers: [GitHub],
  callbacks: {
    ...authConfigBase.callbacks,
    async jwt({ token, account, profile }) {
      if (account?.provider === "github" && profile) {
        const raw = profile as { id?: number | string; login?: string };
        const githubId = Number(raw.id);
        if (!Number.isInteger(githubId)) throw new Error("github profile has no usable numeric id");
        const login = typeof raw.login === "string" ? raw.login : String(githubId);
        const user = await prisma.user.upsert({ where: { githubId }, create: { githubId, login }, update: { login } });
        token.uid = user.id;
      }
      return token;
    },
    session({ session, token }) {
      return { ...session, user: { ...session.user, id: typeof token.uid === "string" ? token.uid : "" } };
    },
  },
} satisfies NextAuthConfig;

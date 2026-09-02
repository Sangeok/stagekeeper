import type { NextAuthConfig } from "next-auth";
import GitHub from "next-auth/providers/github";
import { prisma } from "@/server/db";
import { authConfigBase } from "./config.base";

export const authConfig = {
  ...authConfigBase,
  providers: [GitHub],
  callbacks: {
    ...authConfigBase.callbacks,
    // account·profile은 최초 로그인 요청에만 온다. GitHub 계정을 User로 upsert하고 DB id를 JWT에 싣는다.
    async jwt({ token, account, profile }) {
      if (account?.provider === "github" && profile) {
        const raw = profile as { id?: number | string; login?: string };
        const githubId = Number(raw.id);
        // githubId는 non-null Int 유니크 키다. 프로필에 id가 없거나 숫자가 아니면
        // Number()는 NaN을 주고, 그 NaN이 upsert까지 내려가 Prisma에서 터진다 —
        // 로그인 콜백 안이라 사용자에게는 원인 없는 프레임워크 오류로만 보인다.
        // github.ts가 외부 JSON을 다루는 방식과 같게, 쓰기 전에 막는다.
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

import { randomInt } from "node:crypto";

export async function createFixtureUser(login: string, tokenHash: string, databaseUrl: string): Promise<string> {
  const { withPrisma } = await import("../../lib/prisma");
  return withPrisma(async prisma => {
    const user = await prisma.user.create({ data: { login, githubId: -randomInt(1, 2_000_000_000) } });
    await prisma.userToken.create({ data: { userId: user.id, hash: tokenHash, label: "e2e smoke" } });
    return user.id;
  }, databaseUrl);
}

export async function deleteFixtureUser(userId: string, databaseUrl: string): Promise<void> {
  const { withPrisma } = await import("../../lib/prisma");
  await withPrisma(prisma => prisma.user.delete({ where: { id: userId } }), databaseUrl).catch(() => console.error("cleanup: the fixture user was not deleted"));
}

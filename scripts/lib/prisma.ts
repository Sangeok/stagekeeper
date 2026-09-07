// 스크립트용 Prisma 부트스트랩. src/server/db.ts는 server-only라 스크립트에서 import할 수 없다.
// Not for app code under src/** — this exits the process when DATABASE_URL is missing
// and builds a fresh client per call instead of reusing one. App code uses src/server/db.ts.
// top-level await을 쓰지 않는다 — package.json에 type:module이 없어 tsx가 CJS로 변환한다.
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../src/generated/prisma/client";

// DATABASE_URL이 없으면 첫 쿼리가 아니라 여기서 끝낸다 — PrismaPg는 빈 연결 문자열로도 예외 없이 만들어진다.
export async function withPrisma<T>(run: (prisma: PrismaClient) => Promise<T>): Promise<T> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("DATABASE_URL is not set — copy .env.example to .env and fill it in");
    process.exit(2);
  }
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  try {
    return await run(prisma);
  } finally {
    await prisma.$disconnect();
  }
}

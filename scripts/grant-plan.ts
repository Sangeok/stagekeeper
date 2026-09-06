// 사용자에게 플랜을 붙인다. 결제 경로가 없는 동안 Subscription 행을 쓰는 유일한 길이다 — 손으로 돌린다.
// 사용: npm run plan:grant -- <github login> <free|pro|max> [note]
import { PLANS, isPlan } from "../packages/core/entitlement.mjs";
import { withPrisma } from "./lib/prisma";

const [login, plan, ...rest] = process.argv.slice(2);
const note = rest.join(" ") || null;

async function main() {
  if (!login || !isPlan(plan)) {
    console.error(`usage: npm run plan:grant -- <github login> <${PLANS.join("|")}> [note]`);
    process.exit(2);
  }
  await withPrisma(async (prisma) => {
    // login은 unique가 아니다(GitHub에서 바뀔 수 있어 githubId만 unique). 둘 이상이면 손으로 고르게 한다.
    const users = await prisma.user.findMany({ where: { login }, select: { id: true, githubId: true } });
    if (users.length !== 1) {
      console.error(users.length === 0 ? `no user with login ${login} — sign in on the web once first` : `ambiguous login ${login}: githubIds ${users.map((u) => u.githubId).join(", ")}`);
      process.exit(1);
    }
    const row = await prisma.subscription.upsert({
      where: { userId: users[0].id },
      create: { userId: users[0].id, plan, source: "manual", note },
      update: { plan, source: "manual", note },
    });
    console.log(`granted: ${login} -> ${row.plan}${note ? ` (${note})` : ""}`);
  });
}

main().catch((e) => { console.error(e); process.exit(1); });

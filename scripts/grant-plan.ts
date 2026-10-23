import { PLANS, isPlan } from "../packages/core/plans/entitlement.mjs";
import { changeUserPlan } from "@/server/projects/api";
import { withPrisma } from "./lib/prisma";

const [login, plan, ...rest] = process.argv.slice(2);
const note = rest.join(" ") || null;

async function main() {
  if (!login || !isPlan(plan)) {
    console.error(`usage: npm run plan:grant -- <github login> <${PLANS.join("|")}> [note]`);
    process.exit(2);
  }
  await withPrisma(async (prisma) => {
    const users = await prisma.user.findMany({ where: { login }, select: { id: true, githubId: true } });
    if (users.length !== 1) {
      console.error(users.length === 0 ? `no user with login ${login} — sign in on the web once first` : `ambiguous login ${login}: githubIds ${users.map((u) => u.githubId).join(", ")}`);
      process.exitCode = 1;
      return;
    }
    const row = await changeUserPlan(prisma, { userId: users[0].id, plan, note });
    console.info("project-availability:plan-change", { userId: users[0].id, plan: row.plan, version: row.version });
    console.log(`granted: ${login} -> ${row.plan}${note ? ` (${note})` : ""}`);
  });
}

main().catch(() => { console.error("Plan change failed; no automatic replay. Check the current plan and project list before retrying."); process.exitCode = 1; });

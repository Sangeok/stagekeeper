import { BillingPage } from "@/fsd/pages/billing";
import { AppHeader } from "@/fsd/widgets/app-header";
import { loadHeaderUser } from "@/fsd/widgets/app-header/index.server";
import { requireUser } from "@/server/auth/guard";
import { accountUsage } from "@/server/account-usage";
import type { AccountUsage } from "@/server/account-usage-query";

// 플랜 화면은 프로젝트 밖이다 — 프로젝트 탭 셸을 쓰지 않고 머리만 얹는다(/projects와 같은 모양).
export default async function Page() {
  const { userId } = await requireUser();
  const user = await loadHeaderUser(userId);
  let plan = user.plan;
  let usage: AccountUsage;
  try {
    const snapshot = await accountUsage(userId);
    plan = snapshot.plan;
    usage = snapshot.usage;
  } catch {
    console.error("Could not read account usage");
    usage = { kind: "unavailable" };
  }
  return (
    <>
      <AppHeader login={user.login} plan={plan} />
      <BillingPage plan={plan} usage={usage} />
    </>
  );
}

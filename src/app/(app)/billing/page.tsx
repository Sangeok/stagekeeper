import { BillingPage } from "@/fsd/pages/billing";
import { AppHeader } from "@/fsd/widgets/app-header";
import { loadHeaderUser } from "@/fsd/widgets/app-header/index.server";
import { requireUser } from "@/server/auth/guard";
import { planForUser } from "@/server/entitlement";

// 플랜 화면은 프로젝트 밖이다 — 프로젝트 탭 셸을 쓰지 않고 머리만 얹는다(/projects와 같은 모양).
export default async function Page() {
  const { userId } = await requireUser();
  const user = await loadHeaderUser(userId);
  return (
    <>
      <AppHeader login={user.login} plan={user.plan} />
      <BillingPage plan={user.plan} />
    </>
  );
}

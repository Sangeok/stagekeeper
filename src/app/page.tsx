// 공개 랜딩. (app) 그룹 밖이라 requireUser가 없다 — proxy가 "/"를 정확 일치로 공개한다(config.base.ts).
import type { Metadata } from "next";
import { LANDING_DESCRIPTION, LANDING_TITLE, LandingPage } from "@/fsd/pages/landing";
import { auth, signIn } from "@/server/auth/index";
import { AFTER_SIGN_IN } from "@/server/auth/config.base";

// 색인되는 유일한 페이지. canonical은 www·*.vercel.app으로 들어온 같은 화면을 한 주소로 모은다.
export const metadata: Metadata = {
  title: LANDING_TITLE,
  description: LANDING_DESCRIPTION,
  alternates: { canonical: "/" },
  robots: { index: true, follow: true },
};

export default async function Page() {
  const session = await auth();
  return (
    <LandingPage
      signedIn={!!session?.user?.id}
      signInAction={async () => {
        "use server";
        await signIn("github", { redirectTo: AFTER_SIGN_IN });
      }}
    />
  );
}

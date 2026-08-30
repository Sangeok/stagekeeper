// 공개 랜딩. (app) 그룹 밖이라 requireUser가 없다 — proxy가 "/"를 정확 일치로 공개한다(config.base.ts).
import { LandingPage } from "@/fsd/pages/landing";
import { auth, signIn } from "@/server/auth";
import { AFTER_SIGN_IN } from "@/server/auth/config.base";

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

import type { Metadata } from "next";
import type { ReactElement } from "react";
import { LANDING_DESCRIPTION, LANDING_TITLE, LandingPage } from "@/fsd/pages/landing";
import { auth, signIn } from "@/server/auth/index";
import { AFTER_SIGN_IN } from "@/server/auth/config.base";
import { siteUrl } from "@/server/public-url";

export const metadata: Metadata = {
  title: LANDING_TITLE,
  description: LANDING_DESCRIPTION,
  alternates: { canonical: "/" },
  robots: { index: true, follow: true },
};

export default async function Page(): Promise<ReactElement> {
  const session = await auth();
  const website = { "@context": "https://schema.org", "@type": "WebSite", name: "Stagekeeper", url: siteUrl().href };
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(website).replace(/</g, "\\u003c") }} />
      <LandingPage
        signedIn={!!session?.user?.id}
        signInAction={async () => {
          "use server";
          await signIn("github", { redirectTo: AFTER_SIGN_IN });
        }}
      />
    </>
  );
}

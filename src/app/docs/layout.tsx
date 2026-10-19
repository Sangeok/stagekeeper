import type { Metadata } from "next";
import type { ReactElement, ReactNode } from "react";

import { DocsShell } from "@/fsd/pages/docs/index.server";

export const metadata: Metadata = {
  title: { default: "Docs · Stagekeeper", template: "%s · Stagekeeper" },
  robots: { index: true, follow: true },
};

export default function DocsLayout({ children }: { children: ReactNode }): ReactElement {
  return <DocsShell>{children}</DocsShell>;
}

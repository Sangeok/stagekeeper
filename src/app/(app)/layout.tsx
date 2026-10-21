import { requireUser } from "@/server/auth/guard";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  await requireUser();
  return <div className="flex min-h-full flex-1 flex-col">{children}</div>;
}

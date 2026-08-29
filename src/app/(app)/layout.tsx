import Link from "next/link";
import { requireUser } from "@/server/auth/guard";

// 셸을 그리기 위한 호출이다. 인가는 데이터를 읽는 page·액션이 각자 한다(fsd.md · Next 인증 가이드).
export default async function AppLayout({ children }: LayoutProps<"/">) {
  await requireUser();
  return (
    <div className="flex min-h-full flex-col">
      <header className="border-b border-zinc-200">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between px-4 py-3">
          <Link href="/" className="text-sm font-semibold">
            Stagekeeper
          </Link>
        </div>
      </header>
      {children}
    </div>
  );
}

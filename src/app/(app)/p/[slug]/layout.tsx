import Link from "next/link";
import { requireMember } from "@/server/auth/guard";

const TABS = [
  { href: "", label: "Board" },
  { href: "/inbox", label: "Inbox" },
  { href: "/backlog", label: "Backlog" },
  { href: "/tokens", label: "Tokens" },
];

// 탭 셸용 호출이다. 인가는 각 page와 서버 액션이 자기 requireMember로 한다.
export default async function ProjectLayout({ children, params }: LayoutProps<"/p/[slug]">) {
  const { slug } = await params;
  await requireMember(slug);
  return (
    <div className="flex flex-1 flex-col">
      <nav className="border-b border-zinc-200">
        <div className="mx-auto flex w-full max-w-3xl gap-4 px-4">
          {TABS.map((t) => (
            <Link key={t.label} href={`/p/${slug}${t.href}`} className="py-2 text-sm text-zinc-700 hover:underline">
              {t.label}
            </Link>
          ))}
        </div>
      </nav>
      {children}
    </div>
  );
}

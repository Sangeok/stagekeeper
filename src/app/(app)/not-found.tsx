import Link from "next/link";

// requireMember는 비멤버와 없는 slug를 똑같이 notFound()로 답한다(guard.ts) — 그 호출은
// p/[slug]/layout.tsx 안에서 일어나므로, 그 레이아웃 안쪽의 not-found는 렌더될 수 없다.
// not-found는 자기 세그먼트의 layout 안에서 그려지기 때문이다
// (node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/not-found.md).
// 그래서 프로젝트를 열지 못한 404는 여기가 받는다 — 셸(탭·머리)은 없고 돌아갈 길만 준다.
// 어느 쪽인지는 말하지 않는다: 존재를 드러내지 않는 것이 guard의 규칙이다. 문구는 product-copy.md §17.
export default function NotFound() {
  return (
    <main className="mx-auto flex w-full max-w-[800px] flex-col gap-2 px-5 pt-9 pb-14">
      <h1 className="text-2xl font-semibold tracking-tight">Not found.</h1>
      <p className="text-sm text-quiet">That page doesn&apos;t exist, or it isn&apos;t yours.</p>
      <p className="mt-1">
        <Link href="/projects" className="text-sm underline underline-offset-2">
          All projects
        </Link>
      </p>
    </main>
  );
}

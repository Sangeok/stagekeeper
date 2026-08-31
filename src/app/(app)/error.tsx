"use client";

import Link from "next/link";
import { useEffect } from "react";

import { Button } from "@/fsd/shared/ui/button";

// p/[slug]/error.tsx는 자기 형제인 p/[slug]/layout.tsx의 예외를 받지 못한다. 그 레이아웃은
// 프로젝트 화면을 열 때마다 DB를 읽으므로(findUniqueOrThrow 둘 포함) 실행 빈도가 가장 높다 —
// 이 경계가 없으면 그 실패는 프레임워크 기본 화면으로 떨어진다.
// 여기서는 셸(머리·탭)까지 사라지므로 돌아갈 길을 하나 준다. 문구는 product-copy.md §17.
export default function Error({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  // 서버 예외는 Next가 서버 쪽에 남기지만 클라이언트 렌더 오류는 여기서만 볼 수 있다.
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="mx-auto flex w-full max-w-[800px] flex-col gap-2 px-5 pt-9 pb-14">
      <h1 className="text-2xl font-semibold tracking-tight">Something went wrong.</h1>
      <p className="text-sm text-quiet">Try again, or go back to your projects.</p>
      <div className="mt-1 flex items-center gap-4">
        <Button variant="mine" onClick={() => retry()}>
          Try again
        </Button>
        <Link href="/projects" className="text-sm underline underline-offset-2">
          All projects
        </Link>
      </div>
    </main>
  );
}

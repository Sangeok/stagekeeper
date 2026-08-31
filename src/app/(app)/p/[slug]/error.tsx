"use client";

import { useEffect } from "react";

import { Button } from "@/fsd/shared/ui/button";

// useTransition 안에서 처리되지 않은 오류는 가장 가까운 error boundary로 올라간다
// (node_modules/next/dist/docs/01-app/01-getting-started/10-error-handling.md:372).
// 이 파일이 없으면 게이트 동작 중의 예외가 인증된 라우트 전체를 프레임워크 기본 화면으로 바꾼다.
// p/[slug]/layout.tsx 안쪽이라 TurnBar·AppHeader·ProjectTabs는 살아남고 탭 본문만 대체된다
// (layout 자신의 예외는 여기가 아니라 (app)/error.tsx가 받는다).
// 예상된 실패는 ActionResult로 돌려주므로 여기까지 오지 않는다 — 여기는 예상 밖의 예외만이다.
//
// 문구가 원인을 특정하지 않는 건 의도다: 이 경계는 페이지 렌더 실패와 액션 실패를 구분할 수 없고,
// board.transition은 커밋 뒤에 revalidatePath를 부르므로 기록됐는지도 알 수 없다. 조건절이
// 결정 흐름일 때만 확인 경로를 준다. 문구는 product-copy.md §17.
// prop 이름은 이 Next 버전에서 reset이 아니라 retry다(같은 문서 :217-222).
export default function Error({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  // 서버 예외는 Next가 서버 쪽에 남기지만 클라이언트 렌더 오류는 여기서만 볼 수 있다.
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <section className="flex flex-col gap-2">
      <h1 className="text-2xl font-semibold tracking-tight">Something went wrong.</h1>
      <p className="text-sm text-quiet">
        Try again. If you were approving or sending something back, open the Inbox to check whether it went through.
      </p>
      <div className="mt-1">
        <Button variant="mine" onClick={() => retry()}>
          Try again
        </Button>
      </div>
    </section>
  );
}

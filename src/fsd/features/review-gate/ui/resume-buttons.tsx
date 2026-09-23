"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/fsd/shared/ui/button";
import { resumeTargetsFor } from "../model/gate-source";
import { resumeLabel, resumePrimaryFor, resumeToast } from "../model/gate-text";
import type { InboxItem, TransitionAction } from "../model/inbox-item";
// 보류 카드: 멈춘 자리로 돌아가는 버튼 하나가 주(主). 다른 쪽은 텍스트 링크.
// 서버 액션은 moveItem으로 받는다 — 바로 아래 React의 startTransition과 이름이 겹치지 않게.
export function ResumeButtons({ item, transition: moveItem }: { item: InboxItem; transition: TransitionAction }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const targets = resumeTargetsFor(item.status);
  const primary = resumePrimaryFor(item.heldFrom);
  const secondary = targets.find((to) => to !== primary);

  const resume = (to: string) => {
    startTransition(async () => {
      const result = await moveItem({ key: item.key, to, expectedUpdatedAt: item.updatedAt });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(resumeToast(to, item.key));
      router.refresh();
    });
  };

  if (!targets.includes(primary)) return null;
  return (
    <>
      <Button variant="mine-outline" disabled={isPending} onClick={() => resume(primary)}>
        {resumeLabel(primary)}
      </Button>
      {secondary !== undefined ? (
        <button
          type="button"
          disabled={isPending}
          onClick={() => resume(secondary)}
          className="text-sm text-ink underline underline-offset-2 disabled:opacity-50"
        >
          {resumeLabel(secondary)} instead
        </button>
      ) : null}
    </>
  );
}

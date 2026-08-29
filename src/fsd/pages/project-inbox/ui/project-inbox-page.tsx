import { InboxCard, type DiscardAction, type InboxItem, type TransitionAction } from "@/fsd/features/review-gate";

type Props = { items: InboxItem[]; transition: TransitionAction; discard: DiscardAction };

export function ProjectInboxPage({ items, transition, discard }: Props) {
  return (
    <main className="mx-auto w-full max-w-3xl space-y-6 px-4 py-10">
      <div>
        <h1 className="text-2xl font-semibold">결재함</h1>
        <p className="mt-1 text-sm text-zinc-600">
          다음 단계로 넘길지는 사람이 정합니다. 에이전트 토큰에는 이 도구가 없습니다.
        </p>
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-zinc-600">결재할 보드 항목이 없습니다.</p>
      ) : (
        <div className="space-y-4">
          {items.map((item) => (
            <InboxCard key={item.key} item={item} transition={transition} discard={discard} />
          ))}
        </div>
      )}
    </main>
  );
}

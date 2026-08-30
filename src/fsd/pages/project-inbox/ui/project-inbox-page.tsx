import { InboxCard, type DiscardAction, type InboxItem, type TransitionAction } from "@/fsd/features/review-gate";

type Props = { items: InboxItem[]; now: string; transition: TransitionAction; discard: DiscardAction };

// 결정하는 유일한 자리. 제목은 레이아웃의 턴 배너가 맡는다 — 여기는 카드뿐이다.
export function ProjectInboxPage({ items, now, transition, discard }: Props) {
  if (items.length === 0) return <p className="text-sm text-quiet">Nothing to decide.</p>;
  return (
    <div className="flex flex-col gap-3">
      {items.map((item) => (
        <InboxCard key={item.key} item={item} now={now} transition={transition} discard={discard} />
      ))}
    </div>
  );
}

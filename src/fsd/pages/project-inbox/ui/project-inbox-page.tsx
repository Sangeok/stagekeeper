import type { GateAction, DiscardAction, InboxItem, InboxReadOnlyLabel, TransitionAction } from "@/fsd/features/review-gate";
import { InboxCard } from "@/fsd/features/review-gate/index.server";

type Props = { items: InboxItem[]; now: string; transition: TransitionAction; approve: GateAction; discard: DiscardAction; canWrite: boolean; readOnlyLabel?: InboxReadOnlyLabel };

export function ProjectInboxPage({ items, now, transition, approve, discard, canWrite, readOnlyLabel }: Props) {
  if (items.length === 0) return <p className="text-sm text-quiet">Nothing to decide.</p>;
  return (
    <div className="flex flex-col gap-3">
      {items.map((item) => (
        <InboxCard key={item.key} item={item} now={now} transition={transition} approve={approve} discard={discard} canWrite={canWrite} readOnlyLabel={readOnlyLabel} />
      ))}
    </div>
  );
}

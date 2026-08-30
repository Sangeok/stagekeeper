import { InboxCard, type DiscardAction, type InboxItem, type TransitionAction } from "@/fsd/features/review-gate";

type Props = { items: InboxItem[]; transition: TransitionAction; discard: DiscardAction };

export function ProjectInboxPage({ items, transition, discard }: Props) {
  return (
    <main className="mx-auto w-full max-w-3xl space-y-6 px-4 py-10">
      <div>
        <h1 className="text-2xl font-semibold">Inbox</h1>
        <p className="mt-1 text-sm text-zinc-600">
          Only you can move items to the next step. Agents can&apos;t — their token has no approve tool.
        </p>
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-zinc-600">Nothing to decide.</p>
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

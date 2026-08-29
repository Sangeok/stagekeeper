import { cn } from "@/fsd/shared/lib/class-name";
import { initialOf, type AgentIdentity } from "../model/known-agents";

const DIM = {
  sm: "size-8 text-sm",
  md: "size-9 text-base",
  lg: "size-10 text-lg",
} as const;

// ApcH는 agentId로 identity를 다시 뽑았지만, v2의 identity는 roster에 따라 달라진다
// (identityFor(id, roster)) — briefing이 이미 만든 identity를 그대로 받는다.
export function AgentAvatar({
  identity,
  size = "md",
}: {
  identity: AgentIdentity;
  size?: "sm" | "md" | "lg";
}) {
  return (
    <span
      role="img"
      aria-label={identity.handle}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full bg-zinc-100",
        DIM[size],
      )}
    >
      {identity.emoji || initialOf(identity)}
    </span>
  );
}

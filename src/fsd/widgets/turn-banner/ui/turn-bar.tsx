import { cn } from "@/fsd/shared/lib/class-name";
import type { Turn } from "../model/turn";

const COLOR: Record<Turn["kind"], string> = {
  mine: "bg-mine",
  theirs: "bg-ink",
  none: "bg-rule",
  setup: "bg-rule",
};

export function TurnBar({ turn }: { turn: Turn }) {
  return <div aria-hidden="true" className={cn("fixed inset-x-0 top-0 z-50 h-0.5", COLOR[turn.kind])} />;
}

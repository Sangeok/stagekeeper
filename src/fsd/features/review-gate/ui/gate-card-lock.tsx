"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

import { cn } from "@/fsd/shared/lib/class-name";
import type { CardLock } from "../model/gate-text";

// 카드 단위 잠금(ApcH FEAT-20). 도장·반려가 성공하면 그 카드의 남은 버튼을 다 잠근다.
// 도장 버튼과 반려 패널은 서로 다른 하위 트리라 공용 조상이 없으면 상태를 못 나눈다 —
// 카드마다 하나씩 감싸는 컨텍스트로 공유한다. Provider는 DOM을 만들지 않는다.
type GateCardLockValue = {
  lock: CardLock | null;
  setLock: (lock: CardLock) => void;
};

const GateCardLockContext = createContext<GateCardLockValue | null>(null);

export function useGateCardLock(): GateCardLockValue {
  return useContext(GateCardLockContext) ?? { lock: null, setLock: () => undefined };
}

export function GateCardLock({ children }: { children: ReactNode }) {
  const [lock, setLock] = useState<CardLock | null>(null);
  return <GateCardLockContext.Provider value={{ lock, setLock }}>{children}</GateCardLockContext.Provider>;
}

// 잠금 칩: 색은 점(비텍스트)이 나르고 낱말이 함께 말한다.
export function LockedChip({ lock }: { lock: CardLock }) {
  return (
    <span className="flex items-center gap-1.5 text-xs text-zinc-500">
      <span aria-hidden="true" className={cn("inline-block size-2 rounded-[1px]", lock.marker)} />
      {lock.label}
    </span>
  );
}

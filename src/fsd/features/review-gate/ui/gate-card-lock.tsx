"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

import { Chip } from "@/fsd/shared/ui/chip";
import type { CardLock } from "../model/gate-text";

// 카드 단위 잠금(ApcH FEAT-20). 게이트·되돌리기가 성공하면 그 카드의 남은 버튼을 다 잠근다.
// 게이트 버튼과 보조 동작 패널은 서로 다른 하위 트리라 공용 조상이 없으면 상태를 못 나눈다 —
// 카드마다 하나씩 감싸는 컨텍스트로 공유한다. Provider는 DOM을 만들지 않는다.
type GateCardLockValue = {
  lock: CardLock | null;
  setLock: (lock: CardLock) => void;
};

const GateCardLockContext = createContext<GateCardLockValue | null>(null);

// Provider 밖에서 쓰면 잠금이 조용히 사라진다(같은 결정을 두 번 보낼 수 있다) — 조용히 무너지지 말고 터진다.
export function useGateCardLock(): GateCardLockValue {
  const value = useContext(GateCardLockContext);
  if (value === null) throw new Error("useGateCardLock must be used inside <GateCardLock>");
  return value;
}

export function GateCardLock({ children }: { children: ReactNode }) {
  const [lock, setLock] = useState<CardLock | null>(null);
  return <GateCardLockContext.Provider value={{ lock, setLock }}>{children}</GateCardLockContext.Provider>;
}

// 잠금 칩: 사람이 방금 한 결정은 mine, 폐기는 risk, 나머지는 무채.
export function LockedChip({ lock }: { lock: CardLock }) {
  return <Chip tone={lock.tone}>{lock.label}</Chip>;
}

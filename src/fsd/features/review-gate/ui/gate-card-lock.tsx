"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

import { Chip } from "@/fsd/shared/ui/chip";
import type { CardLock } from "../model/gate-text";

type GateCardLockValue = {
  lock: CardLock | null;
  setLock: (lock: CardLock) => void;
};

const GateCardLockContext = createContext<GateCardLockValue | null>(null);

export function useGateCardLock(): GateCardLockValue {
  const value = useContext(GateCardLockContext);
  if (value === null) throw new Error("useGateCardLock must be used inside <GateCardLock>");
  return value;
}

export function GateCardLock({ children }: { children: ReactNode }) {
  const [lock, setLock] = useState<CardLock | null>(null);
  return <GateCardLockContext.Provider value={{ lock, setLock }}>{children}</GateCardLockContext.Provider>;
}

export function LockedChip({ lock }: { lock: CardLock }) {
  return <Chip tone={lock.tone}>{lock.label}</Chip>;
}

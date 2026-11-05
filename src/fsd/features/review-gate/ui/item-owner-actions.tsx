"use client";

import type { ReactElement } from "react";

import { SectionLabel } from "@/fsd/shared/ui/section-label";
import { rejectActionsFor } from "../model/gate-source";
import { ITEM_ACTIONS_HINT, ITEM_ACTIONS_LABEL } from "../model/gate-text";
import type { DiscardAction, TransitionAction } from "../model/inbox-item";
import { GateCardLock } from "./gate-card-lock";
import { InboxRejectControl } from "./inbox-card-controls";

type Props = {
  itemKey: string;
  status: string;
  updatedAt: string;
  transition: TransitionAction;
  discard: DiscardAction;
};

export function ItemOwnerActions({ itemKey, status, updatedAt, transition, discard }: Props): ReactElement | null {
  if (rejectActionsFor(status).length === 0) return null;
  return (
    <section>
      <SectionLabel>{ITEM_ACTIONS_LABEL}</SectionLabel>
      <div className="flex flex-col gap-2">
        <p className="text-xs text-quiet">{ITEM_ACTIONS_HINT}</p>
        <GateCardLock key={updatedAt}>
          <InboxRejectControl item={{ key: itemKey, status, updatedAt }} transition={transition} discard={discard} />
        </GateCardLock>
      </div>
    </section>
  );
}

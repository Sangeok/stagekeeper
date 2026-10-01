"use client";

import type { ReactElement } from "react";
import { rejectActionsFor } from "../model/gate-source";
import { bounceResultLine, holdResultLine, type RejectAction } from "../model/gate-text";
import type { DiscardAction, GateAction, InboxItem, TransitionAction } from "../model/inbox-item";
import { GateTransitionButton } from "./gate-transition-button";
import { RejectActions } from "./reject-actions";

export function InboxApproveControl({ input, approve }: { input: Parameters<GateAction>[0]; approve: GateAction }): ReactElement {
  return <GateTransitionButton gate={input.gate} itemKey={input.key} commit={() => approve(input)} />;
}

export function InboxRejectControl({ item, transition, discard }: {
  item: Pick<InboxItem, "key" | "status" | "updatedAt">;
  transition: TransitionAction;
  discard: DiscardAction;
}): ReactElement {
  const reject = (action: RejectAction, note: string) => {
    if (action === "discard") return discard(item.key, item.updatedAt);
    // 날짜는 서버 렌더 시간이 아니라 실제 사용자가 누른 시간이다.
    return transition({ key: item.key, to: action === "hold" ? "on_hold" : "planning",
      result: action === "hold" ? holdResultLine(new Date(), note) : bounceResultLine(note), expectedUpdatedAt: item.updatedAt });
  };
  return <RejectActions id={item.key} actions={rejectActionsFor(item.status)} reject={reject} />;
}

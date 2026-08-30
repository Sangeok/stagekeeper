export { InboxCard } from "./ui/inbox-card";
export { GateTransitionButton } from "./ui/gate-transition-button";
export { RejectActions } from "./ui/reject-actions";
export { GateCardLock, LockedChip } from "./ui/gate-card-lock";
export { isGateSource, gateTargetFor, rejectActionsFor, resumeTargetsFor } from "./model/gate-source";
export {
  gateActionLabel,
  gateLockLabel,
  gateNextActionHint,
  gatePendingLabel,
  gateToast,
  holdResultLine,
  rejectLabel,
  rejectLockLabel,
  rejectToast,
  resumeLabel,
  resumeToast,
} from "./model/gate-text";
export type { CardLock, RejectAction } from "./model/gate-text";
export type { DiscardAction, InboxItem, TransitionAction } from "./model/inbox-item";

// slice 밖에서 실제로 쓰는 것만 공개한다. 문구·잠금 헬퍼와 게이트 버튼·보조 동작 패널은
// InboxCard 안에서만 쓰이므로 상대 경로로 남긴다 — 공개하면 provider 없이 쓰는 길이 열린다.
export { InboxCard } from "./ui/inbox-card";
export { isGateSource, needsHumanDecision, pendingInboxCount } from "./model/gate-source";
export { toInboxItems } from "./model/inbox-item";
export type { DiscardAction, InboxItem, TransitionAction, TransitionInput } from "./model/inbox-item";

// 게이트마다 사람이 누르는 Inbox 버튼 이름과, 누르기 전에 결과를 말하는 힌트(product-copy.md §3·§7).
// Inbox 카드(review-gate)와 Pipeline 레일의 게이트 카드 툴팁(edit-pipeline, §18)이 같은 말을 쓰도록 여기 둔다.
// 누르는 중·잠금·토스트 문구는 버튼 동작에만 쓰여 review-gate/model/gate-text.ts에 남는다.
import { gateKind, slotAgent } from "@harness/core/pipeline.mjs";

const GATE_COPY: Record<string, { label: string; hint: string }> = {
  "before-plan": { label: "Request plan", hint: "Requesting lets dev write a plan. Then continue in your coding client. Nothing changes in the code yet." },
  "before-verify": { label: "Continue to verification", hint: "The main loop verifies the plan; plan-verifier runs an independent pass." },
  "before-implement": { label: "Approve implementation", hint: "Approving lets dev change code. Then continue in your coding client." },
  "before-accept": { label: "Continue to acceptance", hint: "The main loop reproduces the five acceptance checks." },
  "before-doc-audit": { label: "Continue to doc audit", hint: "doc-auditor checks whether the docs still match the code." },
  "before-scout": { label: "Continue to scouting", hint: "feature-scout researches outside and proposes features." },
};

// 문구 표의 키. 반복 슬롯(doc-auditor#2, feature-scout#3)의 게이트는 원래 슬롯의 문구를 쓴다.
export function gateCopyId(gate: string): string {
  if (GATE_COPY[gate]) return gate;
  const agent = slotAgent(gateKind(gate));
  return agent === "doc-auditor" ? "before-doc-audit" : agent === "feature-scout" ? "before-scout" : gate;
}
export function gateActionLabel(gate: string): string {
  return GATE_COPY[gateCopyId(gate)]?.label ?? `Move past ${gate}`;
}
// 누르기 전에 보여 준다 — 누른 뒤 토스트로 말하면 이미 늦다.
export function gateActionHint(gate: string): string {
  return GATE_COPY[gateCopyId(gate)]?.hint ?? "Then continue in your coding client.";
}
// 레일의 게이트 카드에 마우스를 올리면 보이는 문장 — Inbox 버튼 이름으로 두 화면을 잇는다.
export function gateTooltip(gate: string): string {
  return `The item waits here until you press ${gateActionLabel(gate)} in the Inbox. ${gateActionHint(gate)}`;
}

import { gateKind, slotAgent } from "@harness/core/pipeline/pipeline.mjs";

const GATE_COPY: Record<string, { label: string; hint: string }> = {
  "before-plan": { label: "Request plan", hint: "Requesting lets dev write a plan. Then continue in your coding client. Nothing changes in the code yet." },
  "before-verify": { label: "Continue to verification", hint: "The main loop verifies the plan; plan-verifier runs an independent pass." },
  "before-implement": { label: "Approve implementation", hint: "Approving lets dev change code. Then continue in your coding client." },
  "before-accept": { label: "Continue to acceptance", hint: "The main loop reproduces the five acceptance checks." },
  "before-impl-verify": { label: "Continue to implementation check", hint: "impl-verifier re-reads the change in a fresh context and checks that the tests catch it." },
  "before-qa": { label: "Continue to QA", hint: "qa-verifier tests the implemented user flows in the configured test environment." },
  "before-doc-audit": { label: "Continue to doc audit", hint: "doc-auditor checks whether the docs still match the code." },
  "before-scout": { label: "Continue to scouting", hint: "feature-scout researches outside and proposes features." },
};

export function gateCopyId(gate: string): string {
  if (GATE_COPY[gate]) return gate;
  const agent = slotAgent(gateKind(gate));
  return agent === "doc-auditor" ? "before-doc-audit" : agent === "feature-scout" ? "before-scout" : gate;
}
export function gateActionLabel(gate: string): string {
  return GATE_COPY[gateCopyId(gate)]?.label ?? `Move past ${gate}`;
}
export function gateActionHint(gate: string): string {
  return GATE_COPY[gateCopyId(gate)]?.hint ?? "Then continue in your coding client.";
}
export function gateTooltip(gate: string): string {
  return `The item waits here until you press ${gateActionLabel(gate)} in the Inbox. ${gateActionHint(gate)}`;
}

import { clientRuntime } from "@harness/core/client-runtime.mjs";
import type { RuntimeClient } from "./next-step";
import type { SetupStep } from "./turn";

export function formatSetupDetail(step: SetupStep, client: RuntimeClient): string {
  if (step.key !== "connect") return step.detail;
  const clientName = client === "claude" ? "Claude Code" : "Codex";
  return `Open the repository in ${clientName} with the token set. Use ${clientRuntime(client).init_command}; it connects the repository and tells you the next steps.`;
}

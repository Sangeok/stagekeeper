import { clientRuntime } from "@harness/core/client-runtime.mjs";
import type { NextStep } from "./turn";

export type RuntimeClient = NonNullable<Parameters<typeof clientRuntime>[0]>;

export function formatNextStep(step: NextStep, client: RuntimeClient): string {
  if (client === "claude") return step.line;
  const resume = `${clientRuntime(client).resume_command} Continue the pipeline for ${step.key}.`;
  return step.kind === "handoff" ? `Commit ${step.note ?? "the prepared file"}, then ${resume}` : resume;
}

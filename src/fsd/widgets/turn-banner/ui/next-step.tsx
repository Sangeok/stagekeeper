"use client";

import type { ReactElement } from "react";
import { CLIENTS, clientRuntime, parseClient } from "@harness/core/client-runtime.mjs";
import { Code, CodeBlock } from "@/fsd/shared/ui/code";
import { CopyButton } from "@/fsd/shared/ui/copy-button";
import { RuntimeClientChoice } from "@/fsd/shared/ui/runtime-client-choice";
import { WATCH_LINE, type NextStep } from "../model/turn";
import { formatNextStep, type RuntimeClient } from "../model/next-step";
import { RUNNER_FREE_LINE, RUNNER_VERSION_LINE } from "../model/runner";

const WATCH_COMMAND = clientRuntime("claude").resume_command;
const OPTIONS = CLIENTS.map(parseClient).map(value => ({ value, label: value === "claude" ? "Claude Code" : "Codex" }));

type Props = {
  steps: NextStep[];
  client: RuntimeClient;
  onClientChange: (client: RuntimeClient) => void;
  showWatch?: boolean;
  showRunnerHint?: boolean;
  showFreeLine?: boolean;
};

export function NextStepContent({ steps, client, onClientChange, showWatch = true, showRunnerHint = false, showFreeLine = false }: Props): ReactElement | null {
  if (steps.length === 0) return null;
  const [before, ...rest] = WATCH_LINE.split(WATCH_COMMAND);
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-mine bg-mine-soft px-3.5 py-3">
      <RuntimeClientChoice value={client} options={OPTIONS} onChange={onClientChange} />
      <p className="text-sm font-medium text-mine">Next, in {client === "claude" ? "Claude Code" : "Codex"}</p>
      {steps.map((step) => {
        const line = formatNextStep(step, client);
        return (
        <div key={step.key} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
          <CodeBlock className="bg-paper">{line}</CodeBlock>
          <CopyButton text={line} />
        </div>
        );
      })}
      {client !== "claude" ? (
        <p className="text-xs text-quiet">Use <Code>{clientRuntime(client).resume_command}</Code> after approval or a confirmed client switch.</p>
      ) : showWatch ? (
        <>
          <p className="text-xs text-quiet">{before}<Code>{WATCH_COMMAND}</Code>{rest.join(WATCH_COMMAND)}</p>
          {showRunnerHint ? <p className="text-xs text-quiet">{RUNNER_VERSION_LINE}</p> : null}
          {showRunnerHint && showFreeLine ? <p className="text-xs text-quiet">{RUNNER_FREE_LINE}</p> : null}
        </>
      ) : null}
    </div>
  );
}

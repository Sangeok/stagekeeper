"use client";

import type { ReactElement } from "react";
import { CLIENTS, clientRuntime, parseClient } from "@harness/core/client-runtime.mjs";
import { Code, CodeBlock } from "@/fsd/shared/ui/code";
import { CopyButton } from "@/fsd/shared/ui/copy-button";
import { RuntimeClientChoice } from "@/fsd/shared/ui/runtime-client-choice";
import { WATCH_LINE, type NextStep } from "../model/turn";
import { formatNextStep, type RuntimeClient } from "../model/next-step";

const WATCH_COMMAND = clientRuntime("claude").resume_command;
const OPTIONS = CLIENTS.map(parseClient).map(value => ({ value, label: value === "claude" ? "Claude Code" : "Codex" }));

// 터미널로 돌아가는 다리. 이 상자만 에이전트 차례에도 --mine을 쓴다 — 복사는 사람의 동작이다.
export function NextStepContent({ steps, client, onClientChange }: { steps: NextStep[]; client: RuntimeClient; onClientChange: (client: RuntimeClient) => void }): ReactElement | null {
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
      <p className="text-xs text-quiet">
        {client === "claude" ? <>{before}<Code>{WATCH_COMMAND}</Code>{rest.join(WATCH_COMMAND)}</> : <>Use <Code>{clientRuntime(client).resume_command}</Code> after approval or a confirmed client switch.</>}
      </p>
    </div>
  );
}

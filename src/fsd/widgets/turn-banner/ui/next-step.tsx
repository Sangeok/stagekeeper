import type { ReactElement } from "react";
import { Code, CodeBlock } from "@/fsd/shared/ui/code";
import { CopyButton } from "@/fsd/shared/ui/copy-button";
import { WATCH_LINE, type NextStep } from "../model/turn";

const WATCH_COMMAND = "/harness:watch";

// 터미널로 돌아가는 다리. 이 상자만 에이전트 차례에도 --mine을 쓴다 — 복사는 사람의 동작이다.
export function NextStepBox({ steps }: { steps: NextStep[] }): ReactElement | null {
  if (steps.length === 0) return null;
  const [before, ...rest] = WATCH_LINE.split(WATCH_COMMAND);
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-mine bg-mine-soft px-3.5 py-3">
      <p className="text-sm font-medium text-mine">Next, in Claude Code</p>
      {steps.map((step) => (
        <div key={step.key} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
          <CodeBlock className="bg-paper">{step.line}</CodeBlock>
          <CopyButton text={step.line} />
        </div>
      ))}
      <p className="text-xs text-quiet">
        {before}
        <Code>{WATCH_COMMAND}</Code>
        {rest.join(WATCH_COMMAND)}
      </p>
    </div>
  );
}

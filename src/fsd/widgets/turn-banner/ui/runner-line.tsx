"use client";

import { useEffect, useState, type ReactElement } from "react";
import { PauseRunnerButton, type PauseRunnerAction } from "@/fsd/features/pause-runner";
import { Code } from "@/fsd/shared/ui/code";
import { runnerLine, runnerShortLine, showsPauseControl, type RunnerFacts, type RunnerLine } from "../model/runner";

const TICK_MS = 30_000;

export function useRunnerNow(renderedAt: string | undefined): number {
  const [tick, setTick] = useState<{ base: string; now: number } | null>(null);
  useEffect(() => {
    if (renderedAt === undefined) return;
    const offset = Date.parse(renderedAt) - Date.now();
    const id = window.setInterval(() => setTick({ base: renderedAt, now: Date.now() + offset }), TICK_MS);
    return () => window.clearInterval(id);
  }, [renderedAt]);
  if (renderedAt === undefined) return 0;
  return tick !== null && tick.base === renderedAt ? tick.now : Date.parse(renderedAt);
}

function RunnerText({ line }: { line: RunnerLine }) {
  return <>{line.map((segment, index) => segment.code ? <Code key={index}>{segment.text}</Code> : <span key={index}>{segment.text}</span>)}</>;
}

export function RunnerRow({ facts, now, pause }: { facts: RunnerFacts; now: number; pause?: PauseRunnerAction }): ReactElement | null {
  const line = runnerLine(facts, now);
  if (line === null) return null;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-quiet" data-runner-line="">
      <p><RunnerText line={line} /></p>
      {pause !== undefined && showsPauseControl(facts) ? <PauseRunnerButton paused={facts.paused} save={pause} /> : null}
    </div>
  );
}

export function RunnerShort({ facts, now }: { facts: RunnerFacts; now: number }): ReactElement | null {
  const line = runnerShortLine(facts, now);
  return line === null ? null : <RunnerText line={line} />;
}

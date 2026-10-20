"use client";

import { useEffect, useState, type ReactElement } from "react";
import { PauseRunnerButton, type PauseRunnerAction } from "@/fsd/features/pause-runner";
import { Code } from "@/fsd/shared/ui/code";
import { runnerLine, runnerShortLine, showsPauseControl, type RunnerFacts, type RunnerLine } from "../model/runner";

const TICK_MS = 30_000;

// 판정의 "지금". 첫 렌더(서버 렌더와 hydration)는 서버가 읽은 DB 시각이라 두 쪽이 같은 문장을 만든다.
// 마운트 뒤에는 브라우저 시계와의 차이를 한 번 재고, 30초마다 "브라우저 시각 + 그 차이"로 다시 계산한다 —
// 사용자 PC 시계가 어긋나도 "No signal"이 서버의 lease 판정과 같은 기준을 쓴다.
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

// 큰 배너의 실행기 줄과 그 옆의 Pause/Resume. 실행기도 일시 정지도 없으면 아무것도 그리지 않는다.
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

// 스트립 꼬리와 프로젝트 목록 카드의 짧은 형태.
export function RunnerShort({ facts, now }: { facts: RunnerFacts; now: number }): ReactElement | null {
  const line = runnerShortLine(facts, now);
  return line === null ? null : <RunnerText line={line} />;
}

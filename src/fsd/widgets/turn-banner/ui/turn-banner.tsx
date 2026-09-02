"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/fsd/shared/lib/class-name";
import { activeProjectTab, type ProjectTabId, projectPath } from "@/fsd/shared/routes/project";
import { ButtonLink } from "@/fsd/shared/ui/button";
import { Chip } from "@/fsd/shared/ui/chip";
import { Code } from "@/fsd/shared/ui/code";
import { HEADLINE, type SetupStep, type Turn } from "../model/turn";
import { NextStepBox } from "./next-step";

// 탭이 아닌 프로젝트 하위 경로(항목 상세 등)에서는 null이다.
type Tab = ProjectTabId | null;

// 레이아웃은 경로를 모른다 — 어느 탭인지는 여기서 읽는다. Board·Inbox에서는 크게, 나머지에서는 한 줄 스트립.
export function TurnBanner({ turn, slug }: { turn: Turn; slug: string }) {
  const tab = activeProjectTab(usePathname(), slug);
  const isFullBanner = tab === "board" || tab === "inbox";
  return isFullBanner ? <FullBanner turn={turn} tab={tab} slug={slug} /> : <CompactBanner turn={turn} tab={tab} slug={slug} />;
}

function FullBanner({ turn, tab, slug }: { turn: Turn; tab: Tab; slug: string }) {
  if (turn.kind === "setup") return <SetupList steps={turn.steps} current={turn.current} slug={slug} />;

  const headline = HEADLINE[turn.kind];
  return (
    <section className="flex flex-col gap-2">
      <h1 className={cn("type-display flex items-center gap-3.5", turn.kind === "mine" && "text-mine")}>
        {turn.kind === "theirs" ? (
          <span aria-hidden="true" className="inline-block size-2 shrink-0 animate-breathe rounded-full bg-current" />
        ) : null}
        {headline}
      </h1>
      {/* Inbox에서는 카드가 바로 아래 있으니 세부 줄을 되풀이하지 않는다. */}
      {turn.kind === "mine" && tab === "inbox" ? null : <p className="max-w-[60ch] text-sm text-quiet">{turn.detail}</p>}
      {turn.kind === "mine" && turn.why !== null ? <p className="text-xs text-quiet">{turn.why}</p> : null}
      {turn.kind === "mine" || turn.kind === "theirs" ? <NextStepBox steps={turn.next} /> : null}
      {turn.kind === "mine" && tab !== "inbox" ? (
        <div className="mt-1">
          <ButtonLink variant="mine" href={projectPath(slug, "/inbox")}>
            Open inbox
          </ButtonLink>
        </div>
      ) : null}
      {turn.kind === "none" ? (
        <div className="mt-1">
          <ButtonLink variant="quiet" href={projectPath(slug, "/backlog")}>
            Open backlog
          </ButtonLink>
        </div>
      ) : null}
    </section>
  );
}

type CompactView = { detail: string; action: { href: string; label: string } | null };

// 한 줄 스트립이 무엇을 말하고 어디로 보낼지 — kind마다 한 갈래씩, 마크업과 분리해서 읽는다.
function compactView(turn: Turn, tab: Tab, slug: string): CompactView {
  switch (turn.kind) {
    case "setup": {
      const step = turn.steps[turn.current - 1];
      return { detail: step === undefined ? "" : `Step ${turn.current} of 4 — ${step.title}.`, action: null };
    }
    case "mine":
      return {
        detail: turn.why === null ? turn.detail : `${turn.detail} · pm is blocked until you clear one`,
        action: { href: projectPath(slug, "/inbox"), label: "Open inbox →" },
      };
    case "theirs":
      return { detail: turn.detail, action: null };
    case "none":
      return {
        detail: turn.detail,
        action: tab === "backlog" ? null : { href: projectPath(slug, "/backlog"), label: "Open backlog →" },
      };
  }
}

function CompactBanner({ turn, tab, slug }: { turn: Turn; tab: Tab; slug: string }) {
  const isMyTurn = turn.kind === "mine";
  const { detail, action } = compactView(turn, tab, slug);
  return (
    <div
      className={cn(
        "flex flex-wrap items-baseline gap-x-2.5 gap-y-1 rounded-lg border px-3.5 py-2.5 text-sm",
        isMyTurn ? "border-mine-soft bg-mine-soft" : "border-rule bg-paper",
      )}
    >
      <b className={cn("font-medium", isMyTurn && "text-mine")}>{turn.kind === "setup" ? "Setting up" : HEADLINE[turn.kind]}</b>
      <span className="text-quiet">{detail}</span>
      {action !== null ? (
        <Link href={action.href} className={cn("ml-auto", isMyTurn ? "text-mine" : "text-ink")}>
          {action.label}
        </Link>
      ) : null}
    </div>
  );
}

// 첫 방문 체크리스트. 단계 1–3은 데이터에서 판정되고, 4는 첫 항목이 보드에 오르면 끝난다.
// current는 deriveTurn이 이미 정한 1-based 값 — 여기서 다시 계산하지 않는다.
function SetupList({ steps, current, slug }: { steps: SetupStep[]; current: number; slug: string }) {
  return (
    <section className="flex flex-col gap-2">
      <h1 className="type-display">{HEADLINE.setup}</h1>
      <ol className="mt-2 flex flex-col border-t border-rule">
        {steps.map((step, i) => {
          const isCurrent = i === current - 1;
          return (
            <li
              key={step.key}
              className={cn(
                "grid grid-cols-[20px_minmax(0,1fr)_auto] items-center gap-3 border-b border-rule py-2.5",
                step.done && "text-quiet",
              )}
            >
              <span
                aria-hidden="true"
                className={cn(
                  "grid size-[18px] place-items-center rounded-full border-[1.5px] text-[11px] leading-none",
                  step.done ? "border-ink bg-ink text-paper" : isCurrent ? "border-mine text-mine" : "border-edge",
                )}
              >
                {step.done ? "✓" : i + 1}
              </span>
              <span className={cn(isCurrent && "font-medium text-mine")}>
                {step.title}
                <small className="block text-xs font-normal text-quiet">
                  {step.key === "connect" ? (
                    <>
                      Open it in Claude Code with the token set, run <Code>/harness:init</Code>, restart, approve the server.
                    </>
                  ) : (
                    step.detail
                  )}
                </small>
              </span>
              <SetupAside step={step} slug={slug} />
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function SetupAside({ step, slug }: { step: SetupStep; slug: string }) {
  if (step.key === "token") return <StepLink href={projectPath(slug, "/tokens")}>Tokens</StepLink>;
  if (step.key === "backlog") return <StepLink href={projectPath(slug, "/backlog")}>Backlog</StepLink>;
  if (step.key === "connect" && !step.done) return <Chip tone="done">Not connected yet</Chip>;
  return <span />;
}

function StepLink({ href, children }: { href: string; children: string }) {
  return (
    <Link href={href} className="text-xs text-quiet underline underline-offset-2">
      {children}
    </Link>
  );
}

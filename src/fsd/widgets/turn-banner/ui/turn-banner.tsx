"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/fsd/shared/lib/class-name";
import { ButtonLink } from "@/fsd/shared/ui/button";
import { Chip } from "@/fsd/shared/ui/chip";
import { Code } from "@/fsd/shared/ui/code";
import { HEADLINE, type SetupStep, type Turn } from "../model/turn";
import { NextStepBox } from "./next-step";

type Tab = "board" | "inbox" | "backlog" | "tokens" | "other";

// 레이아웃은 경로를 모른다 — 어느 탭인지는 여기서 읽는다. Board·Inbox에서는 크게, 나머지에서는 한 줄 스트립.
function tabOf(pathname: string, base: string): Tab {
  if (pathname === base) return "board";
  if (pathname.startsWith(`${base}/inbox`)) return "inbox";
  if (pathname.startsWith(`${base}/backlog`)) return "backlog";
  if (pathname.startsWith(`${base}/tokens`)) return "tokens";
  return "other";
}

export function TurnBanner({ turn, slug }: { turn: Turn; slug: string }) {
  const base = `/p/${slug}`;
  const tab = tabOf(usePathname(), base);
  const full = tab === "board" || tab === "inbox";
  return full ? <FullBanner turn={turn} tab={tab} base={base} /> : <CompactBanner turn={turn} tab={tab} base={base} />;
}

function FullBanner({ turn, tab, base }: { turn: Turn; tab: Tab; base: string }) {
  if (turn.kind === "setup") return <SetupList steps={turn.steps} base={base} />;

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
          <ButtonLink variant="mine" href={`${base}/inbox`}>
            Open inbox
          </ButtonLink>
        </div>
      ) : null}
      {turn.kind === "none" ? (
        <div className="mt-1">
          <ButtonLink variant="quiet" href={`${base}/backlog`}>
            Open backlog
          </ButtonLink>
        </div>
      ) : null}
    </section>
  );
}

function CompactBanner({ turn, tab, base }: { turn: Turn; tab: Tab; base: string }) {
  const mine = turn.kind === "mine";
  let detail: string;
  let action: { href: string; label: string } | null = null;
  if (turn.kind === "setup") {
    const step = turn.steps[turn.current - 1];
    detail = step === undefined ? "" : `Step ${turn.current} of 4 — ${step.title}.`;
  } else if (turn.kind === "mine") {
    detail = turn.why === null ? turn.detail : `${turn.detail} · pm is blocked until you clear one`;
    action = { href: `${base}/inbox`, label: "Open inbox →" };
  } else if (turn.kind === "theirs") {
    detail = turn.detail;
  } else {
    detail = turn.detail;
    if (tab !== "backlog") action = { href: `${base}/backlog`, label: "Open backlog →" };
  }
  return (
    <div
      className={cn(
        "flex flex-wrap items-baseline gap-x-2.5 gap-y-1 rounded-lg border px-3.5 py-2.5 text-sm",
        mine ? "border-mine-soft bg-mine-soft" : "border-rule bg-paper",
      )}
    >
      <b className={cn("font-medium", mine && "text-mine")}>{turn.kind === "setup" ? "Setting up" : HEADLINE[turn.kind]}</b>
      <span className="text-quiet">{detail}</span>
      {action !== null ? (
        <Link href={action.href} className={cn("ml-auto", mine ? "text-mine" : "text-ink")}>
          {action.label}
        </Link>
      ) : null}
    </div>
  );
}

// 첫 방문 체크리스트. 단계 1–3은 데이터에서 판정되고, 4는 첫 항목이 보드에 오르면 끝난다.
function SetupList({ steps, base }: { steps: SetupStep[]; base: string }) {
  const current = steps.findIndex((s) => !s.done);
  return (
    <section className="flex flex-col gap-2">
      <h1 className="type-display">{HEADLINE.setup}</h1>
      <ol className="mt-2 flex flex-col border-t border-rule">
        {steps.map((step, i) => {
          const isCurrent = i === current;
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
              <SetupAside step={step} base={base} />
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function SetupAside({ step, base }: { step: SetupStep; base: string }) {
  if (step.key === "token") return <StepLink href={`${base}/tokens`}>Tokens</StepLink>;
  if (step.key === "backlog") return <StepLink href={`${base}/backlog`}>Backlog</StepLink>;
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

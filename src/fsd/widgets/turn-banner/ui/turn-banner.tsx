"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactElement, type ReactNode } from "react";
import { CLIENTS, clientRuntime, parseClient } from "@harness/core/client-runtime.mjs";
import type { Plan } from "@harness/core/entitlement.mjs";
import type { PauseRunnerAction } from "@/fsd/features/pause-runner";

import { cn } from "@/fsd/shared/lib/class-name";
import { activeProjectTab, itemPath, type ProjectTabId, projectPath } from "@/fsd/shared/routes/project";
import { ButtonLink } from "@/fsd/shared/ui/button";
import { Chip } from "@/fsd/shared/ui/chip";
import { Code } from "@/fsd/shared/ui/code";
import { RuntimeClientChoice } from "@/fsd/shared/ui/runtime-client-choice";
import { HEADLINE, type SetupStep, type Turn, type TurnTarget } from "../model/turn";
import type { RuntimeClient } from "../model/next-step";
import { formatSetupDetail } from "../model/setup-detail";
import { hasLiveRunner, runnerShortLine, type RunnerFacts } from "../model/runner";
import { NextStepContent } from "./next-step";
import { RunnerRow, RunnerShort, useRunnerNow } from "./runner-line";

type Tab = ProjectTabId | null;
const OPTIONS = CLIENTS.map(parseClient).map(value => ({ value, label: value === "claude" ? "Claude Code" : "Codex" }));

type TurnBannerProps = { turn: Turn; slug: string; runner?: RunnerFacts; pause?: PauseRunnerAction; plan?: Plan };

export function TurnBanner(props: TurnBannerProps): ReactElement {
  return <TurnBannerContent key={props.slug} {...props} />;
}

function TurnBannerContent({ turn, slug, runner, pause, plan }: TurnBannerProps): ReactElement {
  const pathname = usePathname();
  const [client, setClient] = useState<RuntimeClient>("claude");
  const now = useRunnerNow(runner?.renderedAt);
  const tab = activeProjectTab(pathname, slug);
  const isFullBanner = tab === "board" || tab === "inbox";
  if (!isFullBanner) return <CompactBanner turn={turn} tab={tab} slug={slug} pathname={pathname} runner={runner} now={now} />;
  const runnerRow = runner === undefined ? null : <RunnerRow facts={runner} now={now} pause={pause} />;
  if (turn.kind === "setup") return <SetupList
    steps={turn.steps.map(step => ({ ...step, detail: formatSetupDetail(step, client) }))}
    current={turn.current}
    slug={slug}
    clientChoice={<RuntimeClientChoice value={client} options={OPTIONS} onChange={setClient} />}
    runnerRow={runnerRow}
  />;
  const nextSteps = turn.kind === "mine" || turn.kind === "theirs"
    ? <NextStepContent steps={turn.next} client={client} onClientChange={setClient}
      showWatch={!hasLiveRunner(runner, now)} showRunnerHint={runner !== undefined && runner.runner === null} showFreeLine={plan === "free"} />
    : null;
  return <FullBanner turn={turn} tab={tab} slug={slug} nextSteps={nextSteps} runnerRow={runnerRow} />;
}

function OpenTargetLink({ open, slug }: { open: TurnTarget; slug: string }) {
  if (open.kind === "inbox") {
    return (
      <ButtonLink variant="mine" href={projectPath(slug, "/inbox")}>
        Open inbox
      </ButtonLink>
    );
  }
  return (
    <ButtonLink variant="quiet" href={itemPath(slug, open.key)}>
      Open {open.key}
    </ButtonLink>
  );
}

function FullBanner({ turn, tab, slug, nextSteps, runnerRow }: { turn: Exclude<Turn, { kind: "setup" }>; tab: Tab; slug: string; nextSteps: ReactNode; runnerRow: ReactNode }) {
  const headline = HEADLINE[turn.kind];
  const inboxCardsAreBelow = turn.kind === "mine" && tab === "inbox" && turn.open.kind === "inbox";
  return (
    <section className="flex flex-col gap-2">
      <h1 className={cn("type-display flex items-center gap-3.5", turn.kind === "mine" && "text-mine")}>
        {turn.kind === "theirs" ? (
          <span aria-hidden="true" className="inline-block size-2 shrink-0 animate-breathe rounded-full bg-current" />
        ) : null}
        {headline}
      </h1>
      {runnerRow}
      {inboxCardsAreBelow ? null : <p className="max-w-[60ch] text-sm text-quiet">{turn.detail}</p>}
      {turn.kind === "mine" && turn.why !== null ? <p className="text-xs text-quiet">{turn.why}</p> : null}
      {nextSteps}
      {turn.kind === "mine" && !inboxCardsAreBelow ? (
        <div className="mt-1">
          <OpenTargetLink open={turn.open} slug={slug} />
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

function compactAction(open: TurnTarget, slug: string, pathname: string): CompactView["action"] {
  if (open.kind === "inbox") return { href: projectPath(slug, "/inbox"), label: "Open inbox →" };
  const href = itemPath(slug, open.key);
  return pathname === href ? null : { href, label: `Open ${open.key} →` };
}

function compactView(turn: Turn, tab: Tab, slug: string, pathname: string): CompactView {
  switch (turn.kind) {
    case "setup": {
      const step = turn.steps[turn.current - 1];
      return { detail: step === undefined ? "" : `Step ${turn.current} of ${turn.steps.length} — ${step.title}.`, action: null };
    }
    case "mine":
      return {
        detail: turn.why === null ? turn.detail : `${turn.detail} · pm is blocked until you clear one`,
        action: compactAction(turn.open, slug, pathname),
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

function CompactBanner({ turn, tab, slug, pathname, runner, now }: { turn: Turn; tab: Tab; slug: string; pathname: string; runner?: RunnerFacts; now: number }) {
  const isMyTurn = turn.kind === "mine";
  const { detail, action } = compactView(turn, tab, slug, pathname);
  const runnerTail = runner !== undefined && runnerShortLine(runner, now) !== null ? runner : null;
  return (
    <div
      className={cn(
        "flex flex-wrap items-baseline gap-x-2.5 gap-y-1 rounded-lg border px-3.5 py-2.5 text-sm",
        isMyTurn ? "border-mine-soft bg-mine-soft" : "border-rule bg-paper",
      )}
    >
      <b className={cn("font-medium", isMyTurn && "text-mine")}>{turn.kind === "setup" ? "Setting up" : HEADLINE[turn.kind]}</b>
      <span className="text-quiet">{detail}{runnerTail !== null ? <>{" · "}<RunnerShort facts={runnerTail} now={now} /></> : null}</span>
      {action !== null ? (
        <Link href={action.href} className={cn("ml-auto", isMyTurn ? "text-mine" : "text-ink")}>
          {action.label}
        </Link>
      ) : null}
    </div>
  );
}

function SetupList({ steps, current, slug, clientChoice, runnerRow }: { steps: SetupStep[]; current: number; slug: string; clientChoice: ReactNode; runnerRow: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h1 className="type-display">{HEADLINE.setup}</h1>
      {runnerRow}
      {clientChoice}
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
                  <DetailText text={step.detail} />
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

const INIT_COMMANDS = CLIENTS.map(client => clientRuntime(parseClient(client)).init_command);

function DetailText({ text }: { text: string }) {
  let parts = [text];
  for (const command of INIT_COMMANDS) {
    parts = parts.flatMap(part => INIT_COMMANDS.includes(part) ? [part] : part.split(command).flatMap(
      (piece, index) => index === 0 ? [piece] : [command, piece],
    ));
  }
  return <>{parts.map((part, index) => INIT_COMMANDS.includes(part) ? <Code key={index}>{part}</Code> : part)}</>;
}

function SetupAside({ step, slug }: { step: SetupStep; slug: string }) {
  if (step.key === "token") return <StepLink href={projectPath(slug, "/tokens")}>Tokens</StepLink>;
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

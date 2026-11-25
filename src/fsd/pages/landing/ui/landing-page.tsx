import Link from "next/link";

import { SiteHeader } from "@/fsd/widgets/site-header";
import { statusLabel } from "@/fsd/entities/board-item";
import { ACCEPTANCE_CHECK_LABELS, gateActionLabel, gateActionHint, nodeLabel } from "@/fsd/entities/pipeline";
import { cn } from "@/fsd/shared/lib/class-name";
import { PROJECT_TABS } from "@/fsd/shared/routes/project";
import { docsPath } from "@/fsd/shared/routes/docs";
import { projectsPath } from "@/fsd/shared/routes/projects";
import { ButtonLink, buttonClass } from "@/fsd/shared/ui/button";
import { cardClass } from "@/fsd/shared/ui/card";
import { Chip } from "@/fsd/shared/ui/chip";

import { HEADLINE, LANDING_INTRO } from "../model/landing-copy";


const CYCLE: { n: number; label: string; you?: true }[] = [
  { n: 1, label: "Proposed" },
  { n: 2, label: "Plan requested", you: true },
  { n: 3, label: "Plan" },
  { n: 4, label: "Verified" },
  { n: 5, label: "Approved", you: true },
  { n: 6, label: "Implemented" },
  { n: 7, label: "Accepted" },
];

const STEPS = ["plan", "implement", "accept"];

const GATE_SETUPS: { title: string; plans: string; gates: string[]; body: string }[] = [
  {
    title: "Two gates",
    plans: "Default on every plan",
    gates: ["before-plan", "before-implement"],
    body: "The pipeline waits for you before planning and before implementation.",
  },
  {
    title: "One gate",
    plans: "Pro and Max",
    gates: ["before-implement"],
    body: "Planning starts without you. You read the plan and approve before code changes.",
  },
  {
    title: "No gates",
    plans: "Pro and Max",
    gates: [],
    body: "Planning and implementation start without your approval. Acceptance still runs.",
  },
];

const ACCEPTANCE_CHECK_MEANINGS: Readonly<Record<string, string>> = {
  1: "The changed files match the plan's list.",
  2: "The change matches the plan's implementation sketch.",
  3: "The verify command runs again and passes.",
  4: "The backlog entry is gone.",
  5: "The report record points to a committed file.",
};

const FACTS = [
  {
    title: "No pass without a record.",
    body: "Follow each item's plans, approvals, and reports. Verified and Accepted appear only when their supporting records exist.",
  },
  {
    title: "Agents can't approve themselves.",
    body: "Where a gate exists, you open it. Work agents cannot open gates or change the pipeline.",
  },
  {
    title: "Runs in your repository.",
    body: "Claude Code runs the agents in your repository. Plans and reports are committed alongside your code; Stagekeeper keeps their references.",
  },
];

export function LandingPage({ signedIn, signInAction }: { signedIn: boolean; signInAction: () => Promise<void> }) {
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <SiteHeader>
        {signedIn ? (
          <Link href={projectsPath()} className="text-sm underline underline-offset-[3px]">
            Open projects
          </Link>
        ) : (
          <form action={signInAction}>
            <button type="submit" className="text-sm underline underline-offset-[3px]">
              Sign in
            </button>
          </form>
        )}
      </SiteHeader>

      <main className="mx-auto w-full max-w-[1040px] px-4 pb-[72px] md:px-6">
        <section className="grid items-start gap-10 py-16 md:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] md:gap-14 md:py-[88px]">
          <div>
            <p className="mb-4 text-sm font-medium text-quiet">A pipeline for Claude Code</p>
            <h1 className="text-[clamp(34px,4.2vw,54px)] leading-[1.02] font-semibold tracking-[-0.03em] text-balance">
              {HEADLINE.agents}
              <br />
              <span className="text-mine">{HEADLINE.you}</span>
            </h1>
            <p className="mt-[22px] max-w-[52ch] text-[17px] leading-[26px] text-quiet">
              {LANDING_INTRO}
            </p>
            <div className="mt-[30px] flex flex-wrap items-center gap-x-5 gap-y-3">
              {signedIn ? (
                <ButtonLink variant="mine" href={projectsPath()} className="px-4 py-[9px] text-[15px] leading-[22px]">
                  Open projects
                </ButtonLink>
              ) : (
                <form action={signInAction}>
                  <button type="submit" className={buttonClass("mine", "md", "px-4 py-[9px] text-[15px] leading-[22px]")}>
                    Continue with GitHub
                  </button>
                </form>
              )}
              <Link href={docsPath("getting-started")} className="text-sm underline underline-offset-[3px]">
                View setup guide
              </Link>
            </div>
            <p className="mt-3 max-w-[52ch] text-xs leading-5 text-quiet">Connect a GitHub repository and install the Claude Code plugin to start.</p>
          </div>
          <div className="min-w-0">
            <InboxDemo />
            <p className="mt-2.5 text-center text-xs leading-5 text-quiet">Example: a verified plan awaiting approval on Pro or Max.</p>
          </div>
        </section>

        <section className="border-t border-rule py-11">
          <h2 className="mb-[22px] text-[11px] font-medium uppercase leading-4 tracking-[0.06em] text-quiet">An example workflow</h2>
          <ol className="grid gap-3.5 md:grid-cols-7 md:gap-0">
            {CYCLE.map((step) => (
              <li
                key={step.n}
                className={cn(
                  "relative flex items-baseline gap-3 md:flex-col md:items-start md:gap-2 md:pr-3",
                  "md:before:absolute md:before:top-[13px] md:before:right-0 md:before:left-[26px] md:before:h-px md:before:bg-rule md:before:content-[''] md:last:before:hidden",
                )}
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    "relative z-[1] grid size-[26px] shrink-0 place-items-center rounded-full border-[1.5px] bg-ground font-mono text-xs",
                    step.you ? "border-mine bg-mine text-on-mine" : "border-edge text-quiet",
                  )}
                >
                  {step.n}
                </span>
                <span className={cn("text-[15px] font-medium tracking-[-0.01em]", step.you && "text-mine")}>{step.label}</span>
                {step.you ? <span className="ml-auto text-xs font-medium text-mine md:ml-0">you</span> : null}
              </li>
            ))}
          </ol>
          <p className="mt-[26px] max-w-[80ch] text-sm leading-[21px] text-quiet">Verified is an independent plan verification, on Pro and Max. Accepted is the acceptance record.</p>
        </section>

        <section className="border-t border-rule py-11">
          <h2 className="mb-2 text-[11px] font-medium uppercase leading-4 tracking-[0.06em] text-quiet">Where the pipeline waits</h2>
          <p className="max-w-[80ch] text-[15px]">A gate is a place where the pipeline waits for your approval. Two gates are the default, not a requirement.</p>
          <p className="mt-2 max-w-[80ch] text-sm leading-[21px] text-quiet">Free uses a fixed pipeline. Pro and Max let you change steps and gates.</p>
          <div className="mt-[22px] grid gap-4 md:grid-cols-3">
            {GATE_SETUPS.map((setup) => (
              <div key={setup.title} className="flex min-w-0 flex-col gap-3 rounded-[10px] border border-rule bg-ground p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <h3 className="text-[17px] leading-6 font-semibold tracking-[-0.015em]">{setup.title}</h3>
                  <span className="text-xs text-quiet">{setup.plans}</span>
                </div>
                <ol className="flex flex-col gap-1.5">
                  {STEPS.map((step) => (
                    <li key={step} className="flex flex-col gap-1.5">
                      {setup.gates.includes(`before-${step}`) ? (
                        <span className="flex items-center gap-2 text-xs font-medium text-mine">
                          <span aria-hidden="true" className="size-2 shrink-0 rounded-full bg-mine" />
                          You: {gateActionLabel(`before-${step}`)}
                        </span>
                      ) : null}
                      <span className="rounded-md bg-field px-2.5 py-1.5 font-mono text-xs">{nodeLabel(step)}</span>
                    </li>
                  ))}
                </ol>
                <p className="text-sm leading-[21px] text-quiet">{setup.body}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="grid gap-8 border-t border-rule py-11 md:grid-cols-2 md:gap-14">
          <div>
            <h2 className="mb-2 text-[17px] leading-6 font-semibold tracking-[-0.015em]">Acceptance is always required.</h2>
            <p className="max-w-[48ch] text-sm leading-[21px] text-quiet">Removing gates does not remove acceptance. The session reproduces five checks and records the result. A failed check waits for you.</p>
            <ol className="mt-4 flex flex-col gap-2.5">
              {Object.entries(ACCEPTANCE_CHECK_LABELS).map(([number, name]) => (
                <li key={number} className="flex items-baseline gap-3 text-sm">
                  <span aria-hidden="true" className="font-mono text-xs text-quiet">{number}</span>
                  <span>
                    <span className="font-medium">{name}</span>
                    <span className="block leading-[21px] text-quiet">{ACCEPTANCE_CHECK_MEANINGS[number]}</span>
                  </span>
                </li>
              ))}
            </ol>
          </div>
          <div>
            <h2 className="mb-2 text-[17px] leading-6 font-semibold tracking-[-0.015em]">Keep the session running.</h2>
            <p className="max-w-[48ch] text-sm leading-[21px] text-quiet">
              <span className="font-mono text-ink">/harness:watch</span> watches for the next available work and lets your Claude Code session continue through steps that do not need you. It does not open gates or push commits for you.
            </p>
            <p className="mt-3 max-w-[48ch] text-sm leading-[21px] text-quiet">The session waits at a gate and at a failed check. An item waiting at a gate does not block other ready work.</p>
            <p className="mt-3 max-w-[48ch] text-sm leading-[21px] text-quiet">Pro and Max add a background runner.</p>
          </div>
        </section>

        <section className="grid gap-7 border-t border-rule pt-11 md:grid-cols-3 md:gap-8">
          {FACTS.map((fact) => (
            <div key={fact.title}>
              <h3 className="mb-2 text-[17px] leading-6 font-semibold tracking-[-0.015em]">{fact.title}</h3>
              <p className="max-w-[34ch] text-sm leading-[21px] text-quiet">{fact.body}</p>
            </div>
          ))}
        </section>

        <footer className="mt-16 flex flex-wrap justify-between gap-x-4 gap-y-2 border-t border-rule pt-5 text-xs text-quiet">
          <span>Stagekeeper</span>
          <Link href={docsPath("overview")} className="underline underline-offset-2">Docs</Link>
          <span>Works with Claude Code · GitHub sign-in</span>
        </footer>
      </main>
    </div>
  );
}

function InboxDemo() {
  return (
    <div aria-hidden="true" className="overflow-hidden rounded-[10px] border border-rule bg-ground md:mt-1.5">
      <div className="h-0.5 bg-mine" />
      <div className="flex gap-[18px] overflow-x-auto overflow-y-hidden border-b border-rule px-4 pt-2.5 text-[13px] whitespace-nowrap text-quiet">
        {PROJECT_TABS.map((tab) =>
          tab.id === "inbox" ? (
            <span key={tab.id} className="inline-flex shrink-0 items-center gap-1.5 border-b-2 border-ink pb-2 font-medium text-ink">
              {tab.label} <span className="rounded-full bg-mine px-1.5 font-mono text-[11px] leading-4 text-on-mine">1</span>
            </span>
          ) : (
            <span key={tab.id} className="shrink-0 pb-2">
              {tab.label}
            </span>
          ),
        )}
      </div>
      <div className="flex flex-col gap-3.5 px-4 pt-5 pb-4">
        <p className="text-[26px] leading-[1.05] font-semibold tracking-[-0.025em] text-mine">Waiting on you</p>
        <div className={cardClass({ decision: true, className: "gap-2.5 px-4 pt-4 pb-3.5" })}>
          <div>
            <p className="font-mono text-xs text-quiet">ITEM-01 · README.md</p>
            <p className="text-base leading-[22px] font-medium tracking-[-0.01em]">Add an install section to the README</p>
            <p className="text-xs text-quiet">
              <b className="font-medium text-ink">{statusLabel("in_review")}</b> · dev submitted a plan 3 days ago
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-2 rounded-md bg-field px-2.5 py-2 text-xs">
            <Chip tone="record">Verified</Chip>
            <span className="font-mono">docs/plans/ITEM-01.md</span>
            <span className="font-mono text-quiet">669476a</span>
          </div>
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-2">
            <span className={buttonClass("mine")}>{gateActionLabel("before-implement")}</span>
            <span className="text-xs text-quiet underline underline-offset-2">Read the plan ↗</span>
          </div>
          <p className="text-xs text-quiet">{gateActionHint("before-implement")}</p>
        </div>
      </div>
    </div>
  );
}

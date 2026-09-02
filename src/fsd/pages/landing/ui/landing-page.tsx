import Link from "next/link";

import { statusLabel } from "@/fsd/entities/board-item";
import { cn } from "@/fsd/shared/lib/class-name";
import { PROJECT_TABS } from "@/fsd/shared/routes/project";
import { ButtonLink, buttonClass } from "@/fsd/shared/ui/button";
import { cardClass } from "@/fsd/shared/ui/card";
import { Chip } from "@/fsd/shared/ui/chip";

// 공개 랜딩(landing-v2, 2026-08-30 승인). 문구는 product-copy.md §16. Server Component — 상호작용은 CTA 폼뿐이다.
// 히어로의 볼드니스는 문장 하나(둘째 줄만 --mine)와 실제 Inbox 카드 한 장에만 있다. 슬로건·그라디언트·모션 없음.

const CYCLE: { n: number; label: string; you?: true }[] = [
  { n: 1, label: "Proposed" },
  { n: 2, label: "Plan requested", you: true },
  { n: 3, label: "Plan" },
  { n: 4, label: "Verified" },
  { n: 5, label: "Approved", you: true },
  { n: 6, label: "Implemented" },
  { n: 7, label: "Accepted" },
];

const FACTS = [
  {
    title: "Agents can't approve themselves.",
    body: "Gate moves and the settings behind them are web-only. The agent token has neither — not by policy text, by the toolset.",
  },
  {
    title: "No pass without a record.",
    body: "An item shows Verified only when an independent pass wrote one. Otherwise it says so.",
  },
  {
    title: "State in one place, files in yours.",
    body: "The board lives in Stagekeeper. Plans and reports are committed next to the code, in your repository.",
  },
];

export function LandingPage({ signedIn, signInAction }: { signedIn: boolean; signInAction: () => Promise<void> }) {
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="border-b border-rule">
        <div className="mx-auto flex w-full max-w-[1040px] items-center justify-between px-4 py-3.5 md:px-6">
          <Link href="/" className="font-semibold tracking-[-0.01em]">
            Stagekeeper
          </Link>
          {signedIn ? (
            <Link href="/projects" className="text-sm underline underline-offset-[3px]">
              Open projects
            </Link>
          ) : (
            <form action={signInAction}>
              <button type="submit" className="text-sm underline underline-offset-[3px]">
                Sign in
              </button>
            </form>
          )}
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1040px] px-4 pb-[72px] md:px-6">
        <section className="grid items-start gap-10 py-16 md:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] md:gap-14 md:py-[88px]">
          <div>
            <h1 className="text-[clamp(34px,4.2vw,54px)] leading-[1.02] font-semibold tracking-[-0.03em] text-balance">
              Your agents build.
              <br />
              <span className="text-mine">You set the rules.</span>
            </h1>
            <p className="mt-[22px] max-w-[52ch] text-[17px] leading-[26px] text-quiet">
              Your Claude Code runs plan → verify → implement → accept. Stagekeeper holds the state, the ledger, and
              the gates. Agents propose, plan, and report — they can&apos;t grant themselves permission.
            </p>
            <div className="mt-[30px]">
              {signedIn ? (
                <ButtonLink variant="mine" href="/projects" className="px-4 py-[9px] text-[15px] leading-[22px]">
                  Open projects
                </ButtonLink>
              ) : (
                <form action={signInAction}>
                  <button type="submit" className={buttonClass("mine", "md", "px-4 py-[9px] text-[15px] leading-[22px]")}>
                    Continue with GitHub
                  </button>
                </form>
              )}
            </div>
          </div>
          <div>
            <InboxDemo />
            <p className="mt-2.5 text-center text-xs text-quiet">Your inbox when a plan is ready for you.</p>
          </div>
        </section>

        <section className="border-t border-rule py-11">
          <h2 className="mb-[22px] text-[11px] font-medium uppercase leading-4 tracking-[0.06em] text-quiet">The cycle you&apos;ll run</h2>
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
          <p className="mt-[26px] text-[15px]">Two of these stop for you today — 2 and 5. The rest you run in your own Claude Code.</p>
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
          <span>Works with Claude Code · GitHub sign-in</span>
        </footer>
      </main>
    </div>
  );
}

// 실제 Inbox 카드(게이트②)와 같은 프리미티브로 그린 정적 데모. 눌리지 않는다.
// 이 데모는 실제 Inbox 화면에 대한 약속이라, 문구가 제품과 갈라지면 랜딩이 거짓말이 된다.
// 탭 목록과 상태 라벨은 소유 모듈에서 직접 가져온다. 나머지 셋은 값을 그대로 적되 출처를 밝힌다:
//   "Waiting on you"  = widgets/turn-banner/model/turn.ts 의 HEADLINE.mine
//   "Approve implementation"                = features/review-gate/model/gate-text.ts GATE_ACTION.implementing.label
//   "Approving lets dev change code. …"     = 같은 파일 GATE_ACTION.implementing.hint
// 두 barrel(turn-banner·review-gate)이 Client Component를 포함하고 있어, 공개 페이지인 랜딩이
// 그것을 모듈 그래프로 끌어오지 않게 한 선택이다. 세 문구를 바꿀 때는 여기도 함께 본다.
function InboxDemo() {
  return (
    <div aria-hidden="true" className="overflow-hidden rounded-[10px] border border-rule bg-ground md:mt-1.5">
      <div className="h-0.5 bg-mine" />
      <div className="flex gap-[18px] border-b border-rule px-4 pt-2.5 text-[13px] text-quiet">
        {PROJECT_TABS.map((tab) =>
          tab.id === "inbox" ? (
            <span key={tab.id} className="-mb-px inline-flex items-center gap-1.5 border-b-2 border-ink pb-2 font-medium text-ink">
              {tab.label} <span className="rounded-full bg-mine px-1.5 font-mono text-[11px] leading-4 text-on-mine">1</span>
            </span>
          ) : (
            <span key={tab.id} className="pb-2">
              {tab.label}
            </span>
          ),
        )}
      </div>
      <div className="flex flex-col gap-3.5 px-4 pt-5 pb-4">
        <p className="text-[26px] leading-[1.05] font-semibold tracking-[-0.025em] text-mine">Waiting on you</p>
        <div className={cardClass(true, "gap-2.5 px-4 pt-4 pb-3.5")}>
          <div>
            <p className="font-mono text-xs text-quiet">FEAT-01 · README.md</p>
            <p className="text-base leading-[22px] font-medium tracking-[-0.01em]">Add an install section to the README</p>
            <p className="text-xs text-quiet">
              <b className="font-medium text-ink">{statusLabel("in_review")}</b> · dev submitted a plan 3 days ago
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-2 rounded-md bg-field px-2.5 py-2 text-xs">
            <Chip tone="record">Verified</Chip>
            <span className="font-mono">docs/plans/FEAT-01.md</span>
            <span className="font-mono text-quiet">669476a</span>
          </div>
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-2">
            <span className={buttonClass("mine")}>Approve implementation</span>
            <span className="text-xs text-quiet underline underline-offset-2">Read the plan ↗</span>
          </div>
          <p className="text-xs text-quiet">Approving lets dev change code. Then you run dev in Claude Code.</p>
        </div>
      </div>
    </div>
  );
}

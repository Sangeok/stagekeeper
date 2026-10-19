import Link from "next/link";
import type { ReactElement } from "react";

import { docsPath } from "@/fsd/shared/routes/docs";
import { Code } from "@/fsd/shared/ui/code";

import { ACCEPTANCE_CHECKS, CLAUDE_COMMANDS, PLAN_FACTS } from "../model/docs-facts";
import { DocsFrame } from "./docs-frame";

export function DocsAutomationPage(): ReactElement {
  return (
    <DocsFrame id="automation">
      <section>
        <h2>Keep the session running</h2>
        <p><Code>{CLAUDE_COMMANDS.watch}</Code> runs from the Claude Code conversation you opened. It watches for the next available work and lets the main session continue through steps that do not need you. The server keeps the state; the agents still run on your side.</p>
        <p>The session follows the saved pipeline and its policy. It does not open approval gates or push commits for you. A policy that does not allow commits can leave it waiting for your commit and an explicit continuation.</p>
        <p><Link href={docsPath("getting-started")}>Set up the connection before starting watch</Link>.</p>
      </section>
      <section>
        <h2>Picking and scouting are separate</h2>
        <p><strong>Automatic picking</strong> lets the PM agent choose a backlog item for the board. Pro and Max can switch it off in the Pipeline tab. Turning it off does not close an existing PM run; you can put an item on the board from the Backlog tab instead.</p>
        <p><strong>Automatic scouting</strong> looks for up to three items when no backlog candidates are available and there is room on the board. Every plan can switch it on or off separately. Turning it off stops the current automatic scout run and further additions.</p>
        <p>A Scout step inside an item&apos;s saved pipeline is different. It follows that pipeline&apos;s order; the automatic scouting switch does not remove those steps.</p>
      </section>
      <section>
        <h2>What pauses the pipeline</h2>
        <ul>
          <li>An approval gate waits for an action in the Inbox or your own authorized session.</li>
          <li>A commit policy can wait for you to commit the result and continue.</li>
          <li>A failed or blocked implementation check or QA step needs attention before the pipeline proceeds.</li>
          <li>A recorded acceptance failure waits for the owner.</li>
          <li>A run allowance or an unavailable project can prevent new work.</li>
        </ul>
        <p className="mt-4">An item waiting at a gate does not mean every other item is blocked. The session can continue other ready work. <Link href={docsPath("approval-gates")}>Choose where your gates belong</Link>.</p>
      </section>
      <section>
        <h2>Acceptance needs five checks</h2>
        <p className="mb-4">Accept is always part of a runnable pipeline. The main session reproduces these checks and records their result:</p>
        <ol className="list-decimal space-y-3 pl-5">{ACCEPTANCE_CHECKS.map((check) => <li key={check.number} className="font-medium">{check.name}</li>)}</ol>
        <p className="mt-4">Done marks the end of implementation, while the acceptance record confirms the result. A recorded failure pauses acceptance. For an environment problem or missing push, choose <strong>Run acceptance again</strong> on the item page when it can run. For incorrect code, reopen planning or implementation with a note.</p>
        <p>The session waits for that owner action instead of repeatedly running failed acceptance checks.</p>
      </section>
      <section>
        <h2>Run limits</h2>
        <p className="mb-4">A five-hour window starts with your account&apos;s first new agent run. New runs across your projects share the allowance below.</p>
        <div role="region" aria-label="Run limits" tabIndex={0} className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-rule"><th scope="col" className="py-3 pr-4">Plan</th><th scope="col" className="py-3">New runs per five-hour window</th></tr></thead>
            <tbody>
              {PLAN_FACTS.map((plan) => (
                <tr key={plan.id} className="border-b border-rule">
                  <td className="py-3 pr-4">{plan.name}</td>
                  <td className="py-3">{plan.dispatches === Infinity ? "Unlimited" : plan.dispatches}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-4">Existing runs can resume or finish after the allowance is used. Ending or failing a run does not refund it. These are agent runs, separate from the server&apos;s request limits.</p>
      </section>
    </DocsFrame>
  );
}

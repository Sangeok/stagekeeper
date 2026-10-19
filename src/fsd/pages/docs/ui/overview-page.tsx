import Link from "next/link";
import type { ReactElement } from "react";

import { docsPath } from "@/fsd/shared/routes/docs";
import { Code } from "@/fsd/shared/ui/code";

import { PLAN_FACTS, STEP_FACTS } from "../model/docs-facts";
import { DocsFrame } from "./docs-frame";

export function DocsOverviewPage(): ReactElement {
  return (
    <DocsFrame id="overview">
      <section>
        <h2>Your session runs the work</h2>
        <p>Stagekeeper keeps the board, pipeline state, approval gates, and records. Your own Claude Code session runs the agents and changes files in your repository. Stagekeeper does not run agents for you.</p>
        <p>Add an item to the backlog, choose where the pipeline should wait, and continue from your session. Start with <Link href={docsPath("getting-started")}>Get started</Link>, then read <Link href={docsPath("automation")}>how automation works</Link>.</p>
      </section>
      <section>
        <h2>Steps and responsibilities</h2>
        <p className="mb-4">The pipeline decides the order. Required steps stay in every runnable pipeline; other steps depend on the plan and the saved definition.</p>
        <div role="region" aria-label="Pipeline steps" tabIndex={0} className="overflow-x-auto">
          <table className="w-full min-w-[560px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-rule">
                <th scope="col" className="py-3 pr-4">Step</th>
                <th scope="col" className="py-3 pr-4">Who runs it</th>
                <th scope="col" className="py-3 pr-4">In the pipeline</th>
                <th scope="col" className="py-3">Available on</th>
              </tr>
            </thead>
            <tbody>
              {STEP_FACTS.map((step) => (
                <tr key={step.id} className="border-b border-rule">
                  <td className="py-3 pr-4 font-medium">{step.name}</td>
                  <td className="py-3 pr-4">{step.agent === null ? "Your session" : <Code>{step.agent}</Code>}</td>
                  <td className="py-3 pr-4">{step.required ? "Required" : step.optIn ? "Opt-in" : "Optional"}</td>
                  <td className="py-3">{step.plans.join(", ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-4">Availability means the step is permitted by your plan. Free keeps its default pipeline; editing opens on Pro. Automatic scouting is separate from an item&apos;s Scout step.</p>
        <p>The workspace dev agent writes the plan and implementation. Accept is your main session reproducing the result and recording the five acceptance checks. It is separate from an approval gate.</p>
      </section>
      <section>
        <h2>Default pipelines by plan</h2>
        <div className="space-y-4">
          {PLAN_FACTS.map((plan) => <div key={plan.id} className="rounded-md border border-rule bg-paper px-4 py-3"><p className="text-xs font-medium text-quiet">{plan.name}</p><ol aria-label={`${plan.name} default pipeline`} className="mt-2 flex list-none flex-wrap items-center gap-x-3 gap-y-1 pl-0">{plan.nodes.map((node, index) => <li key={node}><span aria-hidden="true" className="mr-2 font-mono text-xs text-quiet">{index + 1}</span>{node}</li>)}</ol></div>)}
        </div>
        <p className="mt-4">The default gates wait before Plan and Implement. On plans that allow editing, you can choose different gates and steps. <Link href={docsPath("approval-gates")}>Learn how to edit pipelines and approve gates</Link>.</p>
      </section>
      <section>
        <h2>Verified only with a record</h2>
        <p>A submitted plan is not automatically Verified. That label appears only after an independent pass has a validation record. Verify is optional in an editable pipeline; without that record the item remains Not verified.</p>
        <p>Done means the implementation span has finished. Accepted also needs the main session&apos;s acceptance record. Plans and reports are committed alongside your code; the board keeps their references.</p>
        <p><Link href={docsPath("security")}>Read about tokens, permissions, and where records live</Link>.</p>
      </section>
    </DocsFrame>
  );
}

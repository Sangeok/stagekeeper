import Link from "next/link";
import type { ReactElement } from "react";

import { docsPath } from "@/fsd/shared/routes/docs";

import { DEFAULT_GATE_FACTS, PLAN_FACTS, REPEATED_STEP_NAMES, STEP_FACTS } from "../model/docs-facts";
import { DocsFrame } from "./docs-frame";

export function DocsApprovalGatesPage(): ReactElement {
  const requiredSteps = STEP_FACTS.filter((step) => step.required).map((step) => step.name);
  return (
    <DocsFrame id="approval-gates">
      <section>
        <h2>The two default gates</h2>
        <p className="mb-4">A gate is a place where the pipeline waits for your approval. The default pipeline has these two gates, using the same buttons and hints as the Inbox:</p>
        <dl className="space-y-4">{DEFAULT_GATE_FACTS.map((gate) => <div key={gate.id} className="rounded-md border border-rule bg-paper p-4"><dt className="text-xs font-medium text-quiet">{gate.name}</dt><dd className="mt-2"><p className="font-medium">{gate.action}</p><p className="mt-1 text-sm text-quiet">{gate.hint}</p></dd></div>)}</dl>
        <p className="mt-4">Opening a gate gives the session permission to continue. It does not run the agents on the server.</p>
      </section>
      <section>
        <h2>Edit a pipeline</h2>
        <p>The Pipeline tab lists named pipelines. Choose a default, route item types to a pipeline, or select a runnable pipeline when putting an item on the board.</p>
        <p>Pro and Max can edit steps and gates, reuse a pipeline as a block, and repeat Doc audit or Scout steps. Repeated steps keep separate names, such as <strong>{REPEATED_STEP_NAMES.join(" and ")}</strong>.</p>
        <p>The expanded pipeline that runs an item must contain <strong>{requiredSteps.join(" → ")}</strong> exactly once in that order. A reusable block can contain only part of that sequence. Verify, Implementation check, and QA depend on your plan and chosen steps.</p>
        <p>Saved changes apply to newly proposed items. An item already running keeps its execution version. The web can change a Proposed item&apos;s pipeline only while its run is still open and no agent has started work for that run.</p>
      </section>
      <section>
        <h2>Open gates in the Inbox or your session</h2>
        <div role="region" aria-label="Plan permissions" tabIndex={0} className="overflow-x-auto">
          <table className="w-full min-w-[400px] text-sm">
            <thead><tr className="border-b border-rule"><th scope="col" className="py-3 pr-4">Plan</th><th scope="col" className="py-3 pr-4">Pipeline editing</th><th scope="col" className="py-3">Gate approvals</th></tr></thead>
            <tbody>
              {PLAN_FACTS.map((plan) => (
                <tr key={plan.id} className="border-b border-rule">
                  <td className="py-3 pr-4">{plan.name}</td>
                  <td className="py-3 pr-4">{plan.pipelineEdit ? "Editable" : "Default only"}</td>
                  <td className="py-3">{plan.sessionApprovals ? "Inbox or your session" : "Inbox"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-4">The project must also be available for use. A disconnected or not selected project remains read only.</p>
        <p>A session approval uses a separate owner token. Implementation approval from a session also requires a validation record and the exact plan commit being approved. The Inbox can approve without those two extra conditions. Both paths check the current gate and execution entry.</p>
        <p>If an error says the gate approval was recorded but the next instruction could not be loaded, read the current pipeline state before trying again. Do not repeat the approval blindly.</p>
        <p><Link href={docsPath("security")}>Understand the owner connection and token permissions</Link>.</p>
      </section>
      <section>
        <h2>A pipeline can have no gates</h2>
        <p>With no gates, planning and implementation can start without your approval. Saving such a pipeline asks you to confirm that choice. Acceptance is still required; removing gates does not remove its checks or records.</p>
        <p>Send back, hold, reopen, and discard remain web actions. Agents cannot add approval permissions to their own connection. <Link href={docsPath("automation")}>See the other reasons a pipeline may wait</Link>.</p>
      </section>
    </DocsFrame>
  );
}

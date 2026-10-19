import Link from "next/link";
import type { ReactElement } from "react";

import { docsPath } from "@/fsd/shared/routes/docs";
import { Code } from "@/fsd/shared/ui/code";

import { DocsFrame } from "./docs-frame";

export function DocsSecurityPage(): ReactElement {
  return (
    <DocsFrame id="security">
      <section>
        <h2>Three kinds of token</h2>
        <div role="region" aria-label="Token scopes" tabIndex={0} className="overflow-x-auto"><table className="w-full min-w-[480px] text-sm"><thead><tr className="border-b border-rule"><th scope="col" className="py-3 pr-4">Token</th><th scope="col" className="py-3 pr-4">Scope</th><th scope="col" className="py-3">Used for</th></tr></thead><tbody>
          <tr className="border-b border-rule"><td className="py-3 pr-4"><Code>hs_</Code> Project</td><td className="py-3 pr-4">One project</td><td className="py-3">Agent connection</td></tr>
          <tr className="border-b border-rule"><td className="py-3 pr-4"><Code>hu_</Code> User</td><td className="py-3 pr-4">Repositories you own</td><td className="py-3">Agent connections from one shell</td></tr>
          <tr className="border-b border-rule"><td className="py-3 pr-4"><Code>ho_</Code> Owner</td><td className="py-3 pr-4">You and the project where it was created</td><td className="py-3">Gate approvals from your own session</td></tr>
        </tbody></table></div>
        <p className="mt-4">Project and user tokens connect to <Code>/api/mcp</Code>. A user token still has the agent toolset: it cannot open gates. The plugin supplies the project from <Code>harness.json</Code> on each request, and the server checks that you own it.</p>
        <p>Owner tokens use the separate <Code>/api/mcp/owner</Code> connection. The endpoints do not accept each other&apos;s token kinds. Create owner tokens in the project&apos;s Tokens tab on Pro or Max.</p>
      </section>
      <section>
        <h2>Keep approval permissions separate</h2>
        <p>The agent connection has no gate approval or pipeline settings tool. An owner connection can open the gate the item is waiting at; the server rechecks ownership, project availability, plan, and the gate&apos;s current entry.</p>
        <p>Keep the owner token in your own main session and out of independent agent sessions. It does not grant the web&apos;s other actions: send back, hold, reopen, discard, backlog editing, and token management remain on the web.</p>
        <p><Link href={docsPath("approval-gates")}>Read the extra conditions for session approvals</Link>.</p>
      </section>
      <section>
        <h2>Save, expire, and revoke</h2>
        <p>Stagekeeper stores a hash of a token, not its original value. The value is shown once when created. Save it in secure storage and follow the token screen&apos;s shell instructions. Do not paste the value into a chat or commit it to the repository.</p>
        <p>All three kinds can have an expiry, or no expiry. Restarting a terminal does not expire a token; losing a shell variable does not revoke it. Reuse the same saved value while it is active.</p>
        <p>Revoke an individual token when it is no longer needed. Expired or revoked tokens are refused on subsequent authentication. Their old records stay in the history; ending a token does not erase the work it recorded.</p>
      </section>
      <section>
        <h2>State here, files in your repository</h2>
        <p>Stagekeeper keeps pipeline state, approvals, and references to plans and reports. Your code, plans, and reports stay committed in your Git repository.</p>
        <p>Your Claude Code session runs the agents. Stagekeeper coordinates their next step and records the evidence; it does not run your agents for you. <Link href={docsPath("getting-started")}>Connect your repository</Link> or <Link href={docsPath("automation")}>read how automation continues</Link>.</p>
      </section>
    </DocsFrame>
  );
}

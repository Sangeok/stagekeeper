import Link from "next/link";
import type { ReactElement } from "react";

import { docsPath } from "@/fsd/shared/routes/docs";
import { projectsPath } from "@/fsd/shared/routes/projects";
import { Code, CodeBlock } from "@/fsd/shared/ui/code";
import { CopyButton } from "@/fsd/shared/ui/copy-button";

import { CLAUDE_COMMANDS, INSTALL_COMMANDS } from "../model/docs-facts";
import { DocsFrame } from "./docs-frame";

function Command({ text }: { text: string }): ReactElement {
  return <div className="my-3 grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-2"><CodeBlock className="whitespace-pre-wrap break-words text-sm leading-6">{text}</CodeBlock><CopyButton text={text} /></div>;
}

export function DocsGettingStartedPage(): ReactElement {
  return (
    <DocsFrame id="getting-started">
      <section>
        <h2>1. Connect a repository</h2>
        <p><Link href={projectsPath()} prefetch={false}>Open Stagekeeper</Link> and sign in with GitHub. On Projects, choose <strong>New project</strong>, select or paste the GitHub repository, and check its branch and display name.</p>
        <p>The connection instructions show a project token and the MCP server URL. Save the token in secure storage: its value is shown only once. Follow that screen&apos;s instructions for the terminal that will start Claude Code.</p>
      </section>
      <section>
        <h2>2. Install the plugin</h2>
        <p>Run these commands in your terminal, in this order. Install the plugin before using its commands in Claude Code.</p>
        {INSTALL_COMMANDS.map((command) => <Command key={command} text={command} />)}
        <p>Then follow the token screen to set the token for your shell. A repository <Code>.env</Code> file is not loaded for this connection. Keep the value out of chats and Git commits.</p>
      </section>
      <section>
        <h2>3. Connect Claude Code</h2>
        <p>From the same terminal, change to the repository directory and start Claude Code. Enter this in the <strong>Claude Code prompt</strong>, not the terminal:</p>
        <Command text={CLAUDE_COMMANDS.init} />
        <p>The setup reads the repository, prepares its configuration and agent instructions, and shows the changes before writing. Give it the MCP server URL from Stagekeeper when asked.</p>
        <p>Follow the setup&apos;s restart and connection checks before continuing. If the repository is already connected, rerun setup to preserve its settings and repair missing connection details.</p>
      </section>
      <section>
        <h2>4. Add an item and continue</h2>
        <p>On the project&apos;s Backlog tab, add an item with enough detail for the dev agent to act on it. In your connected Claude Code session, enter:</p>
        <Command text={CLAUDE_COMMANDS.watch} />
        <p>Follow the session&apos;s prompts to choose its policy. Keep that session open while it runs. With the default gates, the Inbox waits for you before planning and implementation; open the gate there, then continue in Claude Code.</p>
        <p>A gate is one reason to wait. A commit that needs you, a recorded acceptance failure, or an execution limit can also pause progress. <Link href={docsPath("automation")}>Read what runs automatically and what waits for you</Link>.</p>
      </section>
      <section>
        <h2>Return to the same connection</h2>
        <p>Restarting a terminal does not expire a token. If its environment variable is gone, set the same saved, active value again before starting Claude Code. If you lost the value, create a replacement in Stagekeeper and revoke the old token when you no longer use it.</p>
        <p>A user token can connect repositories you own from one shell. It has the agent toolset and cannot approve gates. <Link href={docsPath("security")}>Compare project, user, and owner tokens</Link>.</p>
      </section>
    </DocsFrame>
  );
}

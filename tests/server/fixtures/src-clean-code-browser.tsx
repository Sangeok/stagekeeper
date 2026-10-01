// Actual components mounted with local action/clipboard doubles. No production route.
import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { NewProjectForm } from "../../../src/fsd/features/create-project/ui/new-project-form";
import { CopyButton } from "../../../src/fsd/shared/ui/copy-button";
import { TokenReveal } from "../../../src/fsd/entities/project-token/ui/token-reveal";
import { OwnerTokenReveal } from "../../../src/fsd/entities/project-token/ui/owner-token-reveal";
import { NewTokenForm } from "../../../src/fsd/features/manage-token/ui/new-token-form";
import { NewUserTokenForm } from "../../../src/fsd/features/manage-user-token/ui/new-user-token-form";
import { NewOwnerTokenForm } from "../../../src/fsd/features/manage-token/ui/new-owner-token-form";
import { NextStepBox } from "../../../src/fsd/widgets/turn-banner/ui/next-step";
import { InboxCardBoundary } from "../../../src/fsd/features/review-gate/ui/inbox-card-boundary";

const controls = {
  submissions: [] as Record<string, FormDataEntryValue>[],
  writes: [] as string[],
  finishCopy: (_success: boolean) => {},
  finishRegistration: () => {},
  registration: "created" as "created" | "existing" | "disconnected",
};
Object.assign(window, { fixture: controls });
Object.defineProperty(navigator, "clipboard", { configurable: true, value: {
  writeText: (text: string) => new Promise<void>((resolve, reject) => {
    controls.writes.push(text);
    controls.finishCopy = (success: boolean) => success ? resolve() : reject(new Error("local clipboard unavailable"));
  }),
} });

function FormFixture() {
  const picker = new URLSearchParams(location.search).has("picker");
  return <NewProjectForm defaultOwner="fixture-owner" repoLoadFailed={false} mcpUrl="https://fixture.test/api/mcp"
    repos={picker ? [{ name: "picked-repo", defaultBranch: "release/picked" }] : []}
    action={async (_previous, data) => {
      controls.submissions.push(Object.fromEntries(data.entries()));
      await new Promise<void>(resolve => { controls.finishRegistration = resolve; });
      return controls.registration === "created"
        ? { status: "created", slug: "actual-slug", token: "hs_fixture-created" }
        : { status: controls.registration, slug: "actual-slug" };
    }} />;
}

function CopyFixture() {
  const [text, setText] = useState("A"); const [mounted, setMounted] = useState(true);
  return <>
    <button onClick={() => setText("B")}>Change text</button>
    <button onClick={() => setMounted(false)}>Unmount copy</button>
    {mounted ? <section id="copy"><CopyButton text={text} /></section> : null}
    <section id="hs"><TokenReveal token={`hs_fixture-${text}`} mcpUrl="https://fixture.test/api/mcp" /></section>
    <section id="hu"><TokenReveal token={`hu_fixture-${text}`} mcpUrl="https://fixture.test/api/mcp" /></section>
    <section id="ho"><OwnerTokenReveal token={`ho_fixture-${text}`} ownerMcpUrl="https://fixture.test/api/mcp/owner" /></section>
    <section id="next"><NextStepBox steps={[{ key: "same", line: `run-${text}` }]} /></section>
    <section id="new-hs"><NewTokenForm issue={async () => ({ success: true, data: { token: "hs_fixture-issued" } })} mcpUrl="https://fixture.test/api/mcp" /></section>
    <section id="new-hu"><NewUserTokenForm issue={async () => ({ success: true, data: { token: "hu_fixture-issued" } })} mcpUrl="https://fixture.test/api/mcp" /></section>
    <section id="new-ho"><NewOwnerTokenForm issue={async () => ({ success: true, data: { token: "ho_fixture-issued" } })} ownerMcpUrl="https://fixture.test/api/mcp/owner" /></section>
  </>;
}

function Failure({ fail }: { fail: boolean }) { if (fail) throw new Error("local render failure"); return <p>Card A content</p>; }
function BoundaryFixture() {
  const [fail, setFail] = useState(false);
  const router = { refresh: () => setFail(false) };
  return <AppRouterContext.Provider value={router as React.ContextType<typeof AppRouterContext>}>
    <button onClick={() => setFail(true)}>Fail card A render</button>
    <InboxCardBoundary itemKey="A"><Failure fail={fail} /></InboxCardBoundary><article>Card B content</article>
  </AppRouterContext.Provider>;
}

const mode = new URLSearchParams(location.search).get("mode");
createRoot(document.getElementById("root")!).render(mode === "copy" ? <CopyFixture /> : mode === "boundary" ? <BoundaryFixture /> : <FormFixture />);

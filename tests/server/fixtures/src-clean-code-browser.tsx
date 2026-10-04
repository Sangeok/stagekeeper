// Actual components mounted with local action/clipboard doubles. No production route.
import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { PathnameContext } from "next/dist/shared/lib/hooks-client-context.shared-runtime";
import { NewProjectForm } from "../../../src/fsd/features/create-project/ui/new-project-form";
import { CopyButton } from "../../../src/fsd/shared/ui/copy-button";
import { TokenReveal } from "../../../src/fsd/entities/project-token/ui/token-reveal";
import { OwnerTokenReveal } from "../../../src/fsd/entities/project-token/ui/owner-token-reveal";
import { NewTokenForm } from "../../../src/fsd/features/manage-token/ui/new-token-form";
import { NewUserTokenForm } from "../../../src/fsd/features/manage-user-token/ui/new-user-token-form";
import { NewOwnerTokenForm } from "../../../src/fsd/features/manage-token/ui/new-owner-token-form";
import { NextStepBox } from "../../../src/fsd/widgets/turn-banner/ui/next-step";
import { TurnBanner } from "../../../src/fsd/widgets/turn-banner/ui/turn-banner";
import { deriveTurn, type Turn } from "../../../src/fsd/widgets/turn-banner/model/turn";
import { projectPath, type ProjectTabSegment } from "../../../src/fsd/shared/routes/project";
import { InboxCardBoundary } from "../../../src/fsd/features/review-gate/ui/inbox-card-boundary";
import { PipelineRail } from "../../../src/fsd/features/edit-pipeline/ui/pipeline-rail";
import { AutomaticScoutControl } from "../../../src/fsd/features/edit-pipeline/ui/automatic-scout-control";
import { ProjectConnectionControl } from "../../../src/fsd/features/manage-project-connection/ui/project-connection-control";
import { connectionControlKey } from "../../../src/fsd/features/manage-project-connection/model/project-connection-state";
import { ResumeButtons } from "../../../src/fsd/features/review-gate/ui/resume-buttons";
import { defaultGraph } from "../../../packages/core/pipeline.mjs";
import { runAcceptance } from "./src-clean-code-acceptance";

const controls = {
  submissions: [] as Record<string, FormDataEntryValue>[],
  writes: [] as string[],
  finishCopy: (success: boolean) => { void success; },
  finishRegistration: () => {},
  registration: "created" as "created" | "existing" | "disconnected",
  payloads: [] as unknown[],
  refreshes: 0,
  finishAction: (outcome: "success" | "error" | "stale" | "unknown") => { void outcome; },
};
Object.assign(window, { fixture: controls });
const originalClipboard = Object.getOwnPropertyDescriptor(navigator, "clipboard");
const pending = new Set<() => void>();
function installClipboard() { Object.defineProperty(navigator, "clipboard", { configurable: true, value: {
  writeText: (text: string) => new Promise<void>((resolve, reject) => {
    controls.writes.push(text);
    const finish = () => resolve(); pending.add(finish);
    controls.finishCopy = (success: boolean) => { pending.delete(finish); if (success) resolve(); else reject(new Error("local clipboard unavailable")); };
  }),
} }); }

function action<T>(input: unknown, values: { success: T; error: T; stale: T }): Promise<T> {
  controls.payloads.push(input);
  return new Promise((resolve, reject) => {
    const finish = () => resolve(values.error); pending.add(finish);
    controls.finishAction = outcome => {
      pending.delete(finish);
      if (outcome === "unknown") reject(new Error("local response lost")); else resolve(values[outcome]);
    };
  });
}

const router = { refresh: () => { controls.refreshes++; } } as React.ContextType<typeof AppRouterContext>;
function PipelineFixture() {
  return <><AutomaticScoutControl enabled writable save={enabled => action(enabled, { success: { success: true, data: enabled }, error: { success: false, error: "Unavailable" }, stale: { success: false, error: "stale" } })} />
    <PipelineRail graph={defaultGraph("pro")} expectedVersion={3} plan="pro" roster={["dev"]} editable
      save={input => action(input, { success: { status: "success", version: 4 }, error: { status: "error", reason: "Unavailable" }, stale: { status: "stale" } })} /></>;
}
function ScoutFixture() {
  return <AutomaticScoutControl enabled writable save={enabled => action(enabled, { success: { success: true, data: enabled }, error: { success: false, error: "Unavailable" }, stale: { success: false, error: "stale" } })} />;
}
function ConnectionFixture() {
  const [version, setVersion] = useState(4);
  const [disconnected, setDisconnected] = useState(false);
  const target = { id: "a", name: "Alpha", repoOwner: "owner", repo: "repo", disconnectedAt: disconnected ? "2026-10-04T00:00:00Z" : null };
  const summary = { plan: "free" as const, version, limit: 1, connectedCount: disconnected ? 0 : 1 };
  return <><button onClick={() => setVersion(value => value + 1)}>Change version</button><button onClick={() => setDisconnected(value => !value)}>Change connection</button>
    <ProjectConnectionControl key={connectionControlKey(target.id, summary)} target={target} summary={summary}
      disconnect={input => action(input, { success: { status: "success" }, error: { status: "error", reason: "Unavailable" }, stale: { status: "stale" } })}
      reconnect={input => action(input, { success: { status: "success" }, error: { status: "error", reason: "Unavailable" }, stale: { status: "stale" } })} /></>;
}
function ResumeFixture() {
  const [heldFrom, setHeldFrom] = useState("implementing");
  return <><button onClick={() => setHeldFrom("planning")}>Change held from</button><ResumeButtons key={heldFrom} item={{ key: "K-1", status: "on_hold", heldFrom, updatedAt: "2026-10-04T00:00:00Z" }}
    transition={input => action(input, { success: { success: true, data: undefined }, error: { success: false, error: "stale" }, stale: { success: false, error: "stale" } })} /></>;
}

function FormFixture() {
  const picker = new URLSearchParams(location.search).has("picker") || fixturePicker;
  return <NewProjectForm defaultOwner="fixture-owner" repoLoadFailed={false} mcpUrl="https://fixture.test/api/mcp"
    repos={picker ? [{ name: "picked-repo", defaultBranch: "release/picked" }] : []}
    action={async (_previous, data) => {
      controls.submissions.push(Object.fromEntries(data.entries()));
      await new Promise<void>(resolve => { pending.add(resolve); controls.finishRegistration = () => { pending.delete(resolve); resolve(); }; });
      return controls.registration === "created"
        ? { status: "created", slug: "actual-slug", token: "hs_fixture-created" }
        : { status: controls.registration, slug: "actual-slug" };
    }} />;
}

function CopyFixture() {
  const [text, setText] = useState("A"); const [mounted, setMounted] = useState(true);
  const [ownerUrl, setOwnerUrl] = useState("https://fixture.test/api/mcp/owner");
  return <>
    <button onClick={() => setText("B")}>Change text</button>
    <button onClick={() => setOwnerUrl("https://second.fixture.test/api/mcp/owner")}>Change owner URL</button>
    <button onClick={() => setMounted(false)}>Unmount copy</button>
    {mounted ? <section id="copy"><CopyButton text={text} /></section> : null}
    <section id="hs"><TokenReveal token={`hs_fixture-${text}`} mcpUrl="https://fixture.test/api/mcp" /></section>
    <section id="hu"><TokenReveal token={`hu_fixture-${text}`} mcpUrl="https://fixture.test/api/mcp" /></section>
    <section id="ho"><OwnerTokenReveal token={`ho_fixture-${text}`} ownerMcpUrl={ownerUrl} /></section>
    <section id="next"><NextStepBox steps={[
      { kind: "handoff", key: "same", line: `Commit docs/${text}.md, then continue the pipeline for same.`, note: `docs/${text}.md` },
      { kind: "continue", key: "ready", line: "Continue the pipeline for ready." },
      { kind: "handoff", key: "null-note", line: "Commit the prepared file, then continue the pipeline for null-note.", note: null },
    ]} /></section>
    <section id="new-hs"><NewTokenForm issue={async () => ({ success: true, data: { token: "hs_fixture-issued" } })} mcpUrl="https://fixture.test/api/mcp" /></section>
    <section id="new-hu"><NewUserTokenForm issue={async () => ({ success: true, data: { token: "hu_fixture-issued" } })} mcpUrl="https://fixture.test/api/mcp" /></section>
    <section id="new-ho"><NewOwnerTokenForm issue={async () => ({ success: true, data: { token: "ho_fixture-issued" } })} ownerMcpUrl="https://fixture.test/api/mcp/owner" /></section>
  </>;
}

function TurnFixture() {
  const [slug, setSlug] = useState("alpha");
  const [tab, setTab] = useState<ProjectTabSegment>("");
  const [setup, setSetup] = useState(true);
  const turn: Turn = setup ? deriveTurn([], { tokenIssued: true, rosterSynced: false }) : {
    kind: "theirs", detail: "Current fixture work", next: [
      { kind: "continue", key: "K-1", line: "Continue the pipeline for K-1." },
      { kind: "handoff", key: "K-2", line: "Commit the prepared file, then continue the pipeline for K-2.", note: null },
    ],
  };
  return <>
    <button onClick={() => setSetup(false)}>Show work</button>
    <button onClick={() => setSetup(true)}>Show setup</button>
    <button onClick={() => setTab("/backlog")}>Show compact tab</button>
    <button onClick={() => setTab("")}>Show board tab</button>
    <button onClick={() => setTab("/inbox")}>Show inbox tab</button>
    <button onClick={() => setSlug("beta")}>Change banner project</button>
    <PathnameContext.Provider value={projectPath(slug, tab)}>
      <section id="turn"><TurnBanner turn={turn} slug={slug} /></section>
    </PathnameContext.Provider>
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

let root: ReturnType<typeof createRoot> | undefined;
let fixturePicker = false;
function cleanupFixture() {
  root?.unmount(); root = undefined;
  for (const finish of pending) finish(); pending.clear();
  if (originalClipboard) Object.defineProperty(navigator, "clipboard", originalClipboard); else Reflect.deleteProperty(navigator, "clipboard");
}
function renderMode(mode: string, picker = false) {
  cleanupFixture(); fixturePicker = picker;
  controls.writes.length = 0; controls.payloads.length = 0; controls.submissions.length = 0; controls.refreshes = 0;
  installClipboard();
  root = createRoot(document.getElementById("root")!);
  root.render(<AppRouterContext.Provider value={router}>{mode === "copy" ? <CopyFixture /> : mode === "turn" ? <TurnFixture /> : mode === "pipeline" ? <PipelineFixture /> : mode === "scout" ? <ScoutFixture /> : mode === "connection" ? <ConnectionFixture /> : mode === "resume" ? <ResumeFixture /> : mode === "boundary" ? <BoundaryFixture /> : <FormFixture />}</AppRouterContext.Provider>);
}
const toolbar = document.createElement("div");
const run = document.createElement("button"); run.textContent = "Run acceptance";
run.onclick = async () => { run.disabled = true; try { await runAcceptance(renderMode, controls, cleanupFixture); } finally { run.disabled = false; } };
const finish = document.createElement("button"); finish.textContent = "Finish";
const finishSession = async () => { cleanupFixture(); window.removeEventListener("pagehide", cleanupFixture); await fetch("/finish"); };
finish.onclick = finishSession;
toolbar.append(run, finish); document.body.prepend(toolbar);
window.addEventListener("pagehide", cleanupFixture);
renderMode(new URLSearchParams(location.search).get("mode") ?? "form");
if (new URLSearchParams(location.search).has("autorun")) void runAcceptance(renderMode, controls, cleanupFixture);

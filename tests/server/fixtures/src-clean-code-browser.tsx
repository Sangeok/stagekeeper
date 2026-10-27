import React, { useState, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { PathnameContext } from "next/dist/shared/lib/hooks-client-context.shared-runtime";
import { NewProjectForm } from "../../../src/fsd/features/create-project";
import { CopyButton } from "../../../src/fsd/shared/ui/copy-button";
import { TokenReveal } from "../../../src/fsd/entities/project-token/ui/token-reveal";
import { OwnerTokenReveal } from "../../../src/fsd/entities/project-token/ui/owner-token-reveal";
import { NewTokenForm, NewUserTokenForm, NewOwnerTokenForm, RenameTokenForm } from "@/fsd/features/manage-token";
import { NextStepContent } from "../../../src/fsd/widgets/turn-banner/ui/next-step";
import { TurnBanner } from "../../../src/fsd/widgets/turn-banner/ui/turn-banner";
import { deriveTurn, type Turn } from "../../../src/fsd/widgets/turn-banner/model/turn";
import { projectPath, type ProjectTabSegment } from "../../../src/fsd/shared/routes/project";
import { InboxCardBoundary } from "../../../src/fsd/features/review-gate/ui/inbox-card-boundary";
import { ProjectPipelinePage } from "@/fsd/pages/project-pipeline";
import { PipelineRail } from "../../../src/fsd/features/edit-pipeline/ui/pipeline-rail";
import { AutomaticScoutControl } from "../../../src/fsd/features/edit-pipeline/ui/automatic-scout-control";
import { ProjectConnectionControl } from "../../../src/fsd/features/manage-project-connection/ui/project-connection-control";
import { connectionControlKey } from "../../../src/fsd/features/manage-project-connection/model/project-connection-state";
import { ResumeButtons } from "../../../src/fsd/features/review-gate/ui/resume-buttons";
import { ProposeButton } from "../../../src/fsd/features/propose-item/ui/propose-button";
import { BoardItemPage, type BoardItemView } from "../../../src/fsd/pages/board-item/ui/board-item-page";
import { toItemDocs } from "../../../src/fsd/pages/board-item/model/item-docs";
import type { ActionResult } from "../../../src/fsd/shared/api/result";
import { defaultGraph } from "../../../packages/core/pipeline/pipeline.mjs";
import { runAcceptance } from "./src-clean-code-acceptance";
import { githubControls, installGitHubPickerFixture } from "./github-picker-browser";

const controls = {
  submissions: [] as Record<string, FormDataEntryValue>[],
  writes: [] as string[],
  finishCopy: (success: boolean) => { void success; },
  finishRegistration: () => {},
  registration: "created" as "created" | "existing" | "disconnected",
  payloads: [] as unknown[],
  refreshes: 0,
  duplicateKeyWarnings: 0,
  finishAction: (outcome: "success" | "error" | "stale" | "unknown") => { void outcome; },
  setRoster: (roster: string[]) => { void roster; },
};
Object.assign(window, { fixture: controls });
const originalClipboard = Object.getOwnPropertyDescriptor(navigator, "clipboard");
const pending = new Set<() => void>();
let restoreConsole = () => {};
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
    <PipelineRail pipelineId="default" definition={{ steps: defaultGraph("pro").nodes, gates: defaultGraph("pro").gates }} rules={{}} pipelines={[{ id: "default", name: "Default", isDefault: true, definition: { steps: defaultGraph("pro").nodes, gates: defaultGraph("pro").gates }, saved: { version: 3, createdAt: new Date(0) }, runnable: { ...defaultGraph("pro"), format: "slots-v1" } }]} expectedVersion={3} plan="pro" roster={["dev"]} editable
      save={input => action(input, { success: { status: "success", pipelineId: "default", version: 4 }, error: { status: "error", reason: "Unavailable" }, stale: { status: "stale" } })} /></>;
}
function PipelinePageFixture({ unsaved = false }: { unsaved?: boolean }) {
  const [view, setView] = useState({ projectId: "one", version: unsaved ? 0 : 3, graph: defaultGraph("pro"), plan: "pro", editable: true, roster: ["dev"], enabled: true });
  const remoteGraph = () => ({ ...defaultGraph("pro"), nodes: defaultGraph("pro").nodes.filter((node: string) => node !== "verify") });
  const now = new Date("2026-10-15T00:00:00Z");
  return <>
    <div aria-label="Pipeline fixture controls">
      <button onClick={() => setView(current => ({ ...current, version: 4, graph: remoteGraph() }))}>Receive version 4</button>
      <button onClick={() => setView(current => ({ ...current, version: 5, graph: remoteGraph() }))}>Receive version 5</button>
      <button onClick={() => setView(current => ({ ...current, version: 3, graph: defaultGraph("pro") }))}>Receive original version 3</button>
      <button onClick={() => setView(current => ({ ...current, plan: "max" }))}>Change plan</button>
      <button onClick={() => setView(current => ({ ...current, editable: false }))}>Read only</button>
      <button onClick={() => setView(current => ({ ...current, editable: true }))}>Writable</button>
      <button onClick={() => setView(current => ({ ...current, roster: ["other-dev"] }))}>Change roster</button>
      <button onClick={() => setView(current => ({ ...current, plan: "free", editable: false, graph: defaultGraph("free") }))}>Change default plan</button>
      <button onClick={() => setView({ projectId: "two", version: 3, graph: defaultGraph("pro"), plan: "pro", editable: true, roster: ["dev"], enabled: true })}>Switch project</button>
    </div>
    <div id="pipeline-page">
      <ProjectPipelinePage projectId={view.projectId}
        pipelines={[{ id: "default", name: "Default", isDefault: true, definition: { steps: view.graph.nodes, gates: view.graph.gates }, saved: view.version === 0 ? null : { version: view.version, createdAt: now }, runnable: { ...view.graph, format: "slots-v1" } }]}
        rules={{}} autoProposeEnabled actions={{ archive: async () => ({ success: true, data: null }), rename: async () => ({ success: true, data: null }), setDefault: async () => ({ success: true, data: null }), setRule: async () => ({ success: true, data: null }), setAutomaticPick: async () => ({ success: true, data: null }) }} now={now}
        plan={view.plan} roster={view.roster} editable={view.editable} unavailableReason={view.editable ? undefined : "Not selected"}
        autoScoutEnabled={view.enabled} canChangeAutoScout={view.editable}
        save={async input => {
          const result = await action(input, { success: { status: "success" as const, pipelineId: "default", version: input.expectedVersion + 1 }, error: { status: "error" as const, reason: "Unavailable" }, stale: { status: "stale" as const } });
          if (result.status === "success") setView(current => current.projectId === view.projectId && current.version <= result.version
            ? { ...current, version: result.version, graph: { nodes: input.definition.steps, gates: input.definition.gates } } : current);
          return result;
        }}
        saveAutoScout={async enabled => {
          const result = await action(enabled, { success: { success: true as const, data: enabled }, error: { success: false as const, error: "Unavailable" }, stale: { success: false as const, error: "stale" } });
          if (result.success) setView(current => current.projectId === view.projectId ? { ...current, enabled } : current);
          return result;
        }} />
    </div>
  </>;
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
  return <>{new URLSearchParams(location.search).get("mode") === "private-cooldown" ? <RepositoryFixtureControls /> : null}<NewProjectForm defaultOwner="fixture-owner" repoLoadFailed={false} mcpUrl="https://fixture.test/api/mcp"
    picker={githubFixture?.initial}
    repos={picker ? [{ source: "public", repositoryId: "1", owner: "fixture-owner", name: "picked-repo", defaultBranch: "release/picked" }, { source: "public", repositoryId: "2", owner: "fixture-owner", name: "second-repo", defaultBranch: "main" }] : []}
    action={async (_previous, data) => {
      controls.submissions.push(Object.fromEntries(data.entries()));
      await new Promise<void>(resolve => { pending.add(resolve); controls.finishRegistration = () => { pending.delete(resolve); resolve(); }; });
      return controls.registration === "created"
        ? { status: "created", slug: "actual-slug", token: "hs_fixture-created" }
        : { status: controls.registration, slug: "actual-slug" };
    }} /></>;
}

function RepositoryFixtureControls() {
  const [requests, setRequests] = useState<string[]>([]);
  return <section aria-label="Repository fixture controls">
    <button onClick={() => githubControls.limitList()}>Rate limit next list</button>
    <button onClick={() => githubControls.allowList()}>Allow list requests</button>
    <button onClick={() => githubControls.expireCooldown()}>Expire cooldown</button>
    <button onClick={() => githubControls.expire()}>Expire session</button>
    <button onClick={() => setRequests([...githubControls.requests])}>Read request log</button>
    <pre aria-label="Repository request log">{JSON.stringify(requests)}</pre>
  </section>;
}

function NextStepFixture({ steps }: Pick<Parameters<typeof NextStepContent>[0], "steps">) {
  const [client, setClient] = useState<Parameters<typeof NextStepContent>[0]["client"]>("claude");
  return <NextStepContent steps={steps} client={client} onClientChange={setClient} />;
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
    <section id="next"><NextStepFixture steps={[
      { kind: "handoff", key: "same", line: `Commit docs/${text}.md, then continue the pipeline for same.`, note: `docs/${text}.md` },
      { kind: "continue", key: "ready", line: "Continue the pipeline for ready." },
      { kind: "handoff", key: "null-note", line: "Commit the prepared file, then continue the pipeline for null-note.", note: null },
    ]} /></section>
    <section id="new-hs"><NewTokenForm issue={async () => ({ success: true, data: { token: "hs_fixture-issued" } })} mcpUrl="https://fixture.test/api/mcp" /></section>
    <section id="new-hu"><NewUserTokenForm issue={async () => ({ success: true, data: { token: "hu_fixture-issued" } })} mcpUrl="https://fixture.test/api/mcp" /></section>
    <section id="new-ho"><NewOwnerTokenForm issue={async () => ({ success: true, data: { token: "ho_fixture-issued" } })} ownerMcpUrl="https://fixture.test/api/mcp/owner" /></section>
  </>;
}

function TokenIssuanceFixture() {
  const issue = (kind: "hs" | "hu" | "ho") => (label: string, expiresAt: string | null) => action<ActionResult<{ token: string }>>({ kind, label, expiresAt }, {
    success: { success: true, data: { token: `${kind}_fixture-${controls.payloads.length + 1}` } },
    error: { success: false, error: "Refused" }, stale: { success: false, error: "stale" },
  });
  return <>
    <section id="issue-hs"><NewTokenForm issue={issue("hs")} mcpUrl="https://fixture.test/api/mcp" /></section>
    <section id="issue-hu"><NewUserTokenForm issue={issue("hu")} mcpUrl="https://fixture.test/api/mcp" /></section>
    <section id="issue-ho"><NewOwnerTokenForm issue={issue("ho")} ownerMcpUrl="https://fixture.test/api/mcp/owner" /></section>
  </>;
}

function TokenRenameFixture() {
  const [labels, setLabels] = useState({ hs: "agent", hu: "user", ho: "owner" });
  return <>
    <button onClick={() => setLabels({ hs: "server-agent", hu: "server-user", ho: "server-owner" })}>Receive token labels</button>
    {(["hs", "hu", "ho"] as const).map(kind => <section id={`rename-${kind}`} key={kind}>
      <RenameTokenForm label={labels[kind]} rename={async label => {
        const result = await action<ActionResult<null>>({ kind, label }, { success: { success: true, data: null }, error: { success: false, error: "Refused" }, stale: { success: false, error: "stale" } });
        if (result.success) setLabels(previous => ({ ...previous, [kind]: label }));
        return result;
      }} />
    </section>)}
  </>;
}

function DocumentsFixture() {
  const at = new Date("2026-10-14T00:00:00Z");
  const repo = { owner: "fixture", repo: "documents", branch: "main" };
  const report = (id: string): BoardItemView["reports"][number] => ({ id, actor: "dev", path: "docs/report.md", commit: "samecommit", at, acceptedAt: null });
  const [reports, setReports] = useState(() => [report("plan"), report("second")]);
  const item: BoardItemView = {
    id: "documents", pipeline: { pipelineId: null, name: "Default", canChange: false },
    key: "DOC-1", title: "Distinct reports with identical URLs", agent: "dev", area: "web", status: "done",
    reason: "Retain every submission", results: [], validation: null, proposedOn: at, acceptedAt: null,
    acceptanceFailure: null, updatedAt: at.toISOString(), repo, reports, events: [],
    docs: toItemDocs({ planPath: "docs/report.md", planCommit: "samecommit", acceptedAt: null, reports }, repo),
  };
  const unused = async (): Promise<ActionResult<void>> => { throw new Error("Documents fixture must not mutate"); };
  return <>
    <button onClick={() => setReports(current => [...current].reverse())}>Reverse reports</button>
    <button onClick={() => setReports(current => current.slice(1))}>Remove first report</button>
    <button onClick={() => setReports(current => current.some(row => row.id === "third") ? current : [...current, report("third")])}>Add report</button>
    <BoardItemPage slug="documents" item={item} canWrite={false} transition={unused} retryAcceptance={unused} pipelineChoices={[]} changePipeline={async () => { throw new Error("Read-only fixture"); }} />
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
let githubFixture: ReturnType<typeof installGitHubPickerFixture> | null = null;
function cleanupFixture() {
  root?.unmount(); root = undefined;
  githubFixture?.cleanup(); githubFixture = null;
  for (const finish of pending) finish(); pending.clear();
  restoreConsole(); restoreConsole = () => {};
  controls.finishAction = () => {};
  controls.finishCopy = () => {};
  controls.finishRegistration = () => {};
  if (originalClipboard) Object.defineProperty(navigator, "clipboard", originalClipboard); else Reflect.deleteProperty(navigator, "clipboard");
}

function ProposeFixture() {
  const [roster, setRoster] = useState<string[]>([]);
  useEffect(() => {
    controls.setRoster = setRoster;
    return () => { controls.setRoster = () => {}; };
  }, []);
  return <ProposeButton pipelines={[{ id: "default", name: "Default" }]} preselected="default" itemKey="KEY" roster={roster} propose={input => action(input, {
    success: { success: true, data: undefined }, error: { success: false, error: "Refused" }, stale: { success: false, error: "stale" },
  })} />;
}
function renderMode(mode: string, picker = false) {
  cleanupFixture(); fixturePicker = picker;
  if (mode.startsWith("private-")) githubFixture = installGitHubPickerFixture(mode);
  controls.writes.length = 0; controls.payloads.length = 0; controls.submissions.length = 0; controls.refreshes = 0; controls.duplicateKeyWarnings = 0;
  installClipboard();
  if (mode === "documents") {
    const originalError = console.error;
    console.error = (...args: unknown[]) => {
      if (args.some(value => typeof value === "string" && value.includes("Encountered two children with the same key"))) controls.duplicateKeyWarnings++;
      originalError(...args);
    };
    restoreConsole = () => { console.error = originalError; };
  }
  root = createRoot(document.getElementById("root")!);
  root.render(<AppRouterContext.Provider value={router}>{mode === "documents" ? <DocumentsFixture /> : mode === "token-issuance" ? <TokenIssuanceFixture /> : mode === "token-rename" ? <TokenRenameFixture /> : mode === "copy" ? <CopyFixture /> : mode === "turn" ? <TurnFixture /> : mode === "pipeline-page" || mode === "pipeline-page-default" ? <PipelinePageFixture unsaved={mode === "pipeline-page-default"} /> : mode === "pipeline" ? <PipelineFixture /> : mode === "scout" ? <ScoutFixture /> : mode === "connection" ? <ConnectionFixture /> : mode === "resume" ? <ResumeFixture /> : mode === "propose" ? <ProposeFixture /> : mode === "boundary" ? <BoundaryFixture /> : <FormFixture />}</AppRouterContext.Provider>);
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

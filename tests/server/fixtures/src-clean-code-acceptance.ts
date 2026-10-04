type Outcome = "success" | "error" | "stale" | "unknown";
import { PIPELINE_STALE, PIPELINE_UNKNOWN } from "../../../src/fsd/features/edit-pipeline/model/pipeline-save-state";
type Controls = { writes: string[]; payloads: unknown[]; submissions: Record<string, FormDataEntryValue>[]; refreshes: number; finishCopy: (success: boolean) => void; finishAction: (outcome: Outcome) => void; finishRegistration: () => void; setRoster: (roster: string[]) => void };
type Result = { case: string; expected: string; observed: string; status: "Pass" | "Fail" };
const tick = () => new Promise(resolve => setTimeout(resolve, 80));
const check = (condition: unknown, message: string) => { if (!condition) throw new Error(message); };
const buttons = (scope: ParentNode = document) => [...scope.querySelectorAll<HTMLButtonElement>("button")];
const find = (label: string, scope: ParentNode = document) => {
  const button = buttons(scope).find(button => button.textContent?.replace(/\s/g, "") === label.replace(/\s/g, "") || button.getAttribute("aria-label") === label);
  if (!button) throw new Error(`Missing button: ${label}`); return button;
};
const click = async (label: string, scope?: ParentNode) => { find(label, scope).click(); await tick(); };
function input(selector: string, value: string) {
  const field = document.querySelector<HTMLInputElement>(selector); if (!field) throw new Error(`Missing input: ${selector}`);
  field.focus(); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(field, value);
  field.dispatchEvent(new Event("input", { bubbles: true })); return field;
}

export async function runAcceptance(render: (mode: string, picker?: boolean) => void, controls: Controls, cleanup: () => void): Promise<void> {
  const results: Result[] = [];
  const run = async (name: string, expected: string, test: () => Promise<void>) => {
    try { await test(); results.push({ case: name, expected, observed: expected, status: "Pass" }); }
    catch (error) { results.push({ case: name, expected, observed: error instanceof Error ? error.message : "unknown failure", status: "Fail" }); }
    finally { cleanup(); await tick(); }
  };
  const mount = async (mode: string, picker = false) => { render(mode, picker); await tick(); };
  await run("propose roster same instance", "current selection drives display and submission; explicit selection survives reorder/removal/reappearance and reason survives cancel", async () => {
    await mount("propose"); await click("Put on the board");
    const select = document.querySelector<HTMLSelectElement>("select")!;
    check(select.value === "" && find("Put on the board").disabled, "empty roster enabled");
    controls.setRoster(["dev"]); await tick();
    check(document.querySelector("select") === select && select.value === "dev" && !find("Put on the board").disabled, "new roster not derived in same instance");
    input("input", "evidence survives"); await tick();
    controls.setRoster(["dev", "other"]); await tick();
    select.value = "other"; select.dispatchEvent(new Event("change", { bubbles: true })); await tick();
    controls.setRoster(["other", "dev"]); await tick(); check(select.value === "other", "selection lost on reorder");
    controls.setRoster(["dev"]); await tick(); check(select.value === "dev", "missing selection not replaced for display");
    controls.setRoster(["dev", "other"]); await tick(); check(select.value === "other", "explicit selection erased when absent");
    controls.setRoster([]); await tick(); check(select.value === "" && find("Put on the board").disabled, "empty list has old value");
    controls.setRoster(["dev", "other"]); await tick();
    await click("Cancel"); await click("Put on the board");
    check(document.querySelector<HTMLSelectElement>("select")?.value === "other", "cancel cleared explicit selection");
    check(document.querySelector<HTMLInputElement>("input")?.value === "evidence survives", "reason cleared");
    await click("Put on the board");
    check(JSON.stringify(controls.payloads[0]) === JSON.stringify({ key: "KEY", agent: "other", reason: "evidence survives" }), "payload differs from display");
    controls.finishAction("success"); await tick();
  });
  for (const outcome of ["error", "unknown"] as const) await run(`propose pending ${outcome}`, "pending roster changes display but preserve the one captured request; retry uses current roster and retained reason", async () => {
    await mount("propose"); controls.setRoster(["dev"]); await tick(); await click("Put on the board");
    input("input", "captured evidence"); await tick(); await click("Put on the board");
    const snapshot = JSON.stringify(controls.payloads[0]);
    controls.setRoster(["other"]); await tick();
    check(document.querySelector<HTMLSelectElement>("select")?.value === "other", "pending display not current");
    check(controls.payloads.length === 1 && JSON.stringify(controls.payloads[0]) === snapshot && snapshot.includes('"agent":"dev"'), "pending request changed or duplicated");
    controls.finishAction(outcome); await tick();
    check(document.querySelector<HTMLInputElement>("input")?.value === "captured evidence", "failure erased reason");
    await click("Put on the board"); check(controls.payloads.length === 2, "retry not submitted");
    check(JSON.stringify(controls.payloads[1]) === JSON.stringify({ key: "KEY", agent: "other", reason: "captured evidence" }), "retry uses stale roster");
    controls.finishAction("success"); await tick();
  });
  for (const picker of [true, false]) await run(`form name reset ${picker ? "picker" : "manual"}`, "only Start over clears name in the same DOM input; ordinary selection/edit changes keep it and B submits an empty name", async () => {
    await mount("form", picker);
    if (picker) await click("picked-repo release/picked");
    else { input('input[inputmode="url"]', "https://github.com/o/repo-a"); await tick(); }
    await click("Edit"); const name = input('input[name="name"]', "Repository A name"); await tick(); check(document.activeElement === name, "name focus lost");
    await click("Collapse"); check(document.querySelector('input[name="name"]') === name && name.value === "Repository A name", "collapse reset/remounted name");
    if (picker) { await click("Edit"); input('input[name="repo"]', "ordinary-change"); await tick(); await click("Collapse"); }
    else { input('input[inputmode="url"]', "https://github.com/o/ordinary-change"); await tick(); await click("Edit"); input('input[name="repo"]', "direct-change"); await tick(); await click("Collapse"); }
    check(name.value === "Repository A name", "ordinary transition cleared name");
    await click("Start over"); check(document.querySelector('input[name="name"]') === name && name.value === "", "reset did not clear same name input");
    if (picker) await click("second-repo main"); else { input('input[inputmode="url"]', "https://github.com/o/repo-b"); await tick(); }
    await click("Create project"); check(controls.submissions[0]?.name === "", "A name submitted to B");
    check(controls.submissions[0]?.repo === (picker ? "second-repo" : "repo-b"), "B repository mismatch");
    controls.finishRegistration(); await tick();
  });
  await run("form name across entry modes", "manual URL changes, picker/manual switches and ordinary repository selection keep the same display-name input", async () => {
    await mount("form", true); await click("Paste a URL instead");
    input('input[inputmode="url"]', "https://github.com/o/repo-a"); await tick(); await click("Edit");
    const name = input('input[name="name"]', "Preserved name"); await tick();
    input('input[inputmode="url"]', "https://github.com/o/ordinary-change"); await tick();
    check(name.value === "Preserved name", "URL change erased name");
    await click("Pick from my repositories");
    check(document.querySelector('input[name="name"]') === name && name.value === "Preserved name", "picker switch erased/remounted name");
    await click("Paste a URL instead");
    check(document.querySelector('input[name="name"]') === name && name.value === "Preserved name", "manual switch erased/remounted name");
    await click("Pick from my repositories"); await click("second-repo main");
    check(document.querySelector('input[name="name"]') === name && name.value === "Preserved name", "selection erased/remounted name");
  });
  await run("form pending snapshot", "Start over changes only later form state while the captured registration and terminal result retain their lifetime", async () => {
    await mount("form", true); await click("picked-repo release/picked"); await click("Edit"); input('input[name="name"]', "Submitted name"); await tick();
    await click("Create project"); const snapshot = JSON.stringify(controls.submissions[0]);
    await click("Start over"); check(document.querySelector<HTMLInputElement>('input[name="name"]')?.value === "", "pending reset did not clear next state");
    check(controls.submissions.length === 1 && JSON.stringify(controls.submissions[0]) === snapshot && snapshot.includes("Submitted name"), "captured FormData changed");
    controls.finishRegistration(); await tick(); check(document.getElementById("root")?.textContent?.includes("Project created"), "registration result erased");
  });
  await run("copy lifetime", "duplicate writes blocked; stale text success hidden; rejection retry and unmount settle", async () => {
    await mount("copy"); const scope = document.querySelector("#copy")!;
    const copy = find("Copy", scope); copy.click(); copy.click(); await tick(); check(controls.writes.length === 1, "duplicate copy");
    await click("Change text"); controls.finishCopy(true); await tick(); check(find("Copy", scope), "stale Copied");
    await click("Copy", scope); controls.finishCopy(false); await tick(); check(!find("Copy", scope).disabled, "retry locked");
    await click("Copy", scope); await click("Unmount copy"); controls.finishCopy(true); await tick(); check(!document.querySelector("#copy"), "copy root retained");
  });
  await run("client copy matrix", "hs/hu and continue/handoff/null-note display equals clipboard for both clients; Codex has no watch", async () => {
    await mount("copy");
    for (const client of ["Claude Code", "Codex"]) for (const id of ["hs", "hu", "next"]) {
      const scope = document.getElementById(id)!;
      const radio = [...scope.querySelectorAll<HTMLInputElement>('input[type="radio"]')].find(field => field.parentElement?.textContent?.trim() === client)!;
      radio.click(); await tick();
      for (const button of buttons(scope).filter(button => /^(Copy|Copied)$/.test(button.textContent ?? ""))) {
        const displayed = button.previousElementSibling?.textContent;
        button.click(); await tick(); check(controls.writes.at(-1) === displayed, `${id}: copy differs from display`); controls.finishCopy(true); await tick();
      }
      if (client === "Codex") { check(!scope.textContent?.includes("harness:watch"), "Codex watch"); if (id === "next") check(scope.textContent?.includes("Commit docs/A.md"), "handoff prerequisite lost"); }
    }
    check(document.querySelector("#ho")?.textContent?.includes("Claude Code"), "owner token changed");
  });
  await run("owner client selection", "Codex owner display equals copied token-free registration; Claude remains available; selection creates no mutations", async () => {
    await mount("copy");
    const scope = document.getElementById("ho")!;
    const select = async (client: string) => {
      const field = [...scope.querySelectorAll<HTMLInputElement>('input[type="radio"]')].find(field => field.parentElement?.textContent?.trim() === client)!;
      field.click(); await tick();
    };
    check(scope.textContent?.includes("/harness:init"), "Claude owner default missing");
    await select("Codex");
    const code = [...scope.querySelectorAll("code")].find(code => code.textContent?.startsWith("codex mcp add"))!;
    check(code?.textContent === "codex mcp add harness_owner --url 'https://fixture.test/api/mcp/owner' --bearer-token-env-var HARNESS_OWNER_TOKEN", "owner registration differs");
    check(!scope.textContent?.includes("/harness:init"), "Codex incorrectly uses Claude init");
    check(!code.textContent.includes("ho_fixture"), "registration contains token");
    find("Copy", code.parentElement!).click(); await tick();
    check(controls.writes.at(-1) === code.textContent, "owner copy differs");
    controls.finishCopy(true); await tick();
    await select("Claude Code");
    check(scope.textContent?.includes("/harness:init") && !scope.textContent?.includes("codex mcp add"), "Claude owner recovery missing");
    check(controls.payloads.length === 0 && controls.submissions.length === 0 && controls.refreshes === 0, "selection caused a mutation");
  });
  await run("owner identity reset", "changing only owner URL or token resets to Claude and subsequent Codex registration uses the new URL", async () => {
    await mount("copy");
    const scope = document.getElementById("ho")!;
    const radios = () => [...scope.querySelectorAll<HTMLInputElement>('input[type="radio"]')];
    radios()[1].click(); await tick();
    await click("Change owner URL");
    check(radios()[0].checked, "owner URL did not reset client");
    radios()[1].click(); await tick();
    check(scope.textContent?.includes("--url 'https://second.fixture.test/api/mcp/owner'"), "owner URL is stale");
    await click("Change text");
    check(radios()[0].checked && scope.textContent?.includes("ho_fixture-B"), "new owner token did not reset client");
  });
  await run("banner client lifecycle", "setup and next share selection across view and tab changes; project change resets to Claude", async () => {
    await mount("turn");
    const scope = document.getElementById("turn")!;
    const radios = () => [...scope.querySelectorAll<HTMLInputElement>('input[type="radio"]')];
    check(radios()[0].checked && scope.textContent?.includes("/harness:init"), "setup default missing");
    radios()[1].click(); await tick();
    check(scope.textContent?.includes("$harness-init") && !scope.textContent?.includes("/harness:init"), "setup guidance not selected");
    await click("Show work");
    check(radios()[1].checked && scope.textContent?.includes("$harness-resume"), "setup selection lost on work");
    for (const button of buttons(scope).filter(button => button.textContent === "Copy")) {
      const displayed = button.previousElementSibling?.textContent;
      button.click(); await tick(); check(controls.writes.at(-1) === displayed, "banner copy differs"); controls.finishCopy(true); await tick();
    }
    check(!scope.textContent?.includes("/harness:watch"), "Codex banner advertises watch");
    await click("Show compact tab"); check(radios().length === 0, "compact banner expanded");
    await click("Show board tab"); check(radios()[1].checked, "tab navigation lost selection");
    await click("Show inbox tab"); check(radios()[1].checked, "inbox navigation lost selection");
    await click("Change banner project"); check(radios()[0].checked && scope.textContent?.includes("/harness:watch"), "project did not reset selection");
    radios()[1].click(); await tick(); await click("Show setup");
    check(radios()[1].checked && scope.textContent?.includes("$harness-init"), "work selection lost on setup");
    check(controls.payloads.length === 0 && controls.submissions.length === 0 && controls.refreshes === 0, "banner choice caused a mutation");
  });
  for (const outcome of ["success", "error", "stale", "unknown"] as const) await run(`pipeline ${outcome}`, "pending edits/discard/re-entry blocked; draft and explicit recovery follow outcome", async () => {
    await mount("pipeline"); await click("Remove");
    const open = buttons().find(button => button.textContent?.trim() === "+"); if (open) { open.click(); await tick(); }
    const save = find("Save"); save.click(); save.click(); await tick();
    check(controls.payloads.length === 1, "duplicate save"); check(find("Discard changes").disabled, "discard allowed pending");
    check(!document.querySelector<HTMLButtonElement>('[role="switch"]')?.disabled, "scout locked with graph");
    for (const button of buttons(document.getElementById("root")!)) if (/^(Add |Move |Remove$|Swap$)/.test(button.textContent ?? "")) check(button.disabled, "graph edit allowed pending");
    controls.finishAction(outcome); await tick();
    if (outcome === "success") check(!buttons().some(button => button.textContent === "Discard changes"), "success baseline dirty");
    else if (outcome === "error") check(!find("Save").disabled, "validation retry blocked");
    else { check(find("Save").disabled, "unsafe retry allowed"); check(find("Discard changes and reload"), "explicit reload missing"); check(document.querySelector('[role="alert"]')?.textContent === (outcome === "stale" ? PIPELINE_STALE : PIPELINE_UNKNOWN), "canonical recovery mismatch"); }
  });
  for (const outcome of ["error", "unknown", "success"] as const) await run(`scout ${outcome}`, "one mutation; refusal preserves state; unknown refreshes without resubmission", async () => {
    await mount("scout"); await click("Automatic scouting"); check(find("Automatic scouting").disabled, "pending switch active");
    controls.finishAction(outcome); await tick(); check(controls.payloads.length === 1, "scout resubmitted");
    check(controls.refreshes === (outcome === "unknown" ? 1 : 0), "scout refresh contract");
    if (outcome !== "success") check(document.querySelector('[role="alert"]'), "scout refusal missing");
  });
  await run("pipeline independent scouting", "scouting can mutate while graph save waits; graph payload keeps its submitted snapshot", async () => {
    await mount("pipeline"); await click("Remove"); await click("Save");
    const finishGraph = controls.finishAction; const submitted = JSON.stringify(controls.payloads[0]);
    await click("Automatic scouting"); check(controls.payloads.length === 2 && controls.payloads[1] === false, "scouting blocked by graph save");
    controls.finishAction("success"); await tick(); finishGraph("success"); await tick();
    check(JSON.stringify(controls.payloads[0]) === submitted, "graph snapshot changed");
  });
  await run("pipeline zero gates", "zero-gate save requires explicit confirmation and submits once", async () => {
    await mount("pipeline");
    let gateRemove = buttons().find(button => button.textContent === "Remove" && button.parentElement?.textContent?.includes("Gate · you"));
    while (gateRemove) { gateRemove.click(); await tick(); gateRemove = buttons().find(button => button.textContent === "Remove" && button.parentElement?.textContent?.includes("Gate · you")); }
    await click("Save"); check(controls.payloads.length === 0, "zero gates submitted without confirmation");
    const confirm = find("Save without a gate"); confirm.click(); confirm.click(); await tick(); check(controls.payloads.length === 1, "confirmation duplicated save");
    check(JSON.stringify(controls.payloads[0]).includes('"gates":[]'), "zero gates not submitted"); controls.finishAction("success"); await tick();
  });
  await run("connection focus and reset", "menu focus/Escape/outside click; version remount clears confirmation", async () => {
    await mount("connection"); const trigger = find("More actions for Alpha"); await click("More actions for Alpha");
    const menu = document.querySelector<HTMLButtonElement>('[role="menuitem"]')!; check(document.activeElement === menu, "menu not focused");
    menu.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); await tick(); check(document.activeElement === trigger && !document.querySelector('[role="menu"]'), "Escape focus");
    await click("More actions for Alpha"); document.body.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true })); await tick(); check(!document.querySelector('[role="menu"]'), "outside click");
    await click("More actions for Alpha"); await click("Disconnect repository…"); await click("Change version"); check(!document.querySelector('section[aria-label="Disconnect repository"]'), "confirmation survived version change");
  });
  await run("pipeline unmount", "late save cannot replace a new root's draft or recovery state", async () => {
    await mount("pipeline"); await click("Remove"); await click("Save");
    const finish = controls.finishAction;
    await mount("pipeline"); finish("stale"); await tick();
    check(!document.querySelector('[role="alert"]'), "old response leaked into new root");
    await click("Remove"); check(!find("Save").disabled, "new root retained old pending lock");
  });
  for (const outcome of ["success", "error", "stale", "unknown"] as const) await run(`connection ${outcome}`, "pending disabled; exact CAS payload; error remains; stale/unknown reset and refresh", async () => {
    await mount("connection"); await click("More actions for Alpha"); await click("Disconnect repository…"); await click("Disconnect repository");
    check(find("Cancel").disabled, "pending cancel active");
    check(JSON.stringify(controls.payloads[0]) === JSON.stringify({ targetProjectId: "a", expectedVersion: 4 }), "connection payload");
    controls.finishAction(outcome); await tick(); check(controls.payloads.length === 1, "connection resubmitted");
    check(controls.refreshes === (outcome === "stale" || outcome === "unknown" ? 1 : 0), "connection refresh contract");
    check(!!document.querySelector('section[aria-label="Disconnect repository"]') === (outcome === "error"), "confirmation recovery");
  });
  await run("form transitions", "typing keeps focus; Edit→picker keeps editing; selection/collapse/reset and FormData remain consistent", async () => {
    await mount("form", true); await click("Paste a URL instead");
    const field = input('input[inputmode="url"]', "https://github.com/url-owner/url-repo"); await tick(); check(document.activeElement === field, "typing focus lost");
    await click("Edit"); await click("Pick from my repositories");
    check(!document.querySelector<HTMLDivElement>('div[hidden]'), "editing lost on picker");
    await click("picked-repo release/picked"); await click("Collapse");
    await click("Create project"); check(controls.submissions[0]?.owner === "fixture-owner" && controls.submissions[0]?.repo === "picked-repo" && controls.submissions[0]?.branch === "release/picked", "FormData selection mismatch");
  });
  await run("form invalid/reset", "invalid URL clears selection; manual reset clears draft; touched slug survives URL/pick", async () => {
    await mount("form"); input('input[inputmode="url"]', "https://github.com/o/r"); await tick(); await click("Edit"); input('input[name="slug"]', "custom"); await tick();
    input('input[inputmode="url"]', "https://github.com/o/other"); await tick(); check(document.querySelector<HTMLInputElement>('input[name="slug"]')?.value === "custom", "touched slug overwritten");
    input('input[inputmode="url"]', "invalid"); await tick(); check(find("Create project").disabled, "old parsed repository reused");
    input('input[inputmode="url"]', "https://github.com/o/other"); await tick(); await click("Start over"); check(document.querySelector<HTMLInputElement>('input[inputmode="url"]')?.value === "", "reset URL retained");
  });
  for (const outcome of ["success", "stale"] as const) await run(`resume ${outcome}`, "four-field input emits key/to/timestamp once; success refresh only", async () => {
    await mount("resume"); await click("Resume implementation"); check(find("Resume implementation").disabled, "resume not pending");
    check(JSON.stringify(controls.payloads[0]) === JSON.stringify({ key: "K-1", to: "implementing", expectedUpdatedAt: "2026-10-04T00:00:00Z" }), "resume payload");
    controls.finishAction(outcome); await tick(); check(controls.refreshes === (outcome === "success" ? 1 : 0), "resume refresh");
  });
  for (const heldFrom of ["implementing", "planning"]) for (const to of ["implementing", "planning"]) await run(`resume ${heldFrom} to ${to}`, "primary and secondary preserve their exact destination and timestamp", async () => {
    await mount("resume"); if (heldFrom === "planning") await click("Change held from");
    const label = to === "planning" ? "Resume planning" : "Resume implementation";
    await click(label + (to === heldFrom ? "" : " instead"));
    check(JSON.stringify(controls.payloads[0]) === JSON.stringify({ key: "K-1", to, expectedUpdatedAt: "2026-10-04T00:00:00Z" }), "resume destination changed");
    controls.finishAction("success"); await tick();
  });
  const output = document.createElement("pre"); output.id = "acceptance-results"; output.textContent = JSON.stringify(results, null, 2);
  document.querySelector("#acceptance-results")?.remove(); document.body.append(output);
  await fetch("/results", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(results) });
}

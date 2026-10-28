type Outcome = "success" | "error" | "stale" | "unknown";
import { PIPELINE_STALE, PIPELINE_UNKNOWN } from "../../../src/fsd/features/edit-pipeline/model/pipeline-save-state";
import { githubControls } from "./github-picker-browser";
type Controls = { writes: string[]; payloads: unknown[]; submissions: Record<string, FormDataEntryValue>[]; refreshes: number; duplicateKeyWarnings: number; finishCopy: (success: boolean) => void; finishAction: (outcome: Outcome) => void; finishRegistration: () => void; setRoster: (roster: string[]) => void };
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
  if (!new URLSearchParams(location.search).has("private-only")) {
  for (const kind of ["hs", "hu", "ho"] as const) for (const outcome of ["success", "error", "unknown"] as const) {
    await run(`rename ${kind} ${outcome}`, "the shared form preserves required input, one pending request, scope, reset/refresh and server label updates", async () => {
      await mount("token-rename");
      const scope = document.getElementById(`rename-${kind}`)!;
      const selector = `#rename-${kind} input[name="label"]`;
      const original = document.querySelector<HTMLInputElement>(selector)!.value;
      input(selector, ""); await click("Save name", scope);
      check(controls.payloads.length === 0, "empty name reached the Action");
      input(selector, "Renamed"); await click("Save name", scope);
      check(find("Saving…", scope).disabled && scope.querySelector<HTMLInputElement>("input")?.disabled, "pending rename was not locked");
      await click("Saving…", scope);
      check(JSON.stringify(controls.payloads) === JSON.stringify([{ kind, label: "Renamed" }]), "rename scope changed or duplicate request sent");
      controls.finishAction(outcome); await tick(); await tick();
      check(scope.querySelector<HTMLInputElement>("input")?.value === (outcome === "success" ? "Renamed" : original), "rename result/reset differs");
      check(controls.refreshes === (outcome === "success" ? 0 : 1), "rename refresh contract differs");
      check(outcome === "success" ? !scope.querySelector('[role="alert"]') : scope.querySelector('[role="alert"]')?.textContent === (outcome === "error" ? "Refused" : "Could not save the name. The list will be refreshed."), "rename error guidance differs");
      await click("Receive token labels");
      check(scope.querySelector<HTMLInputElement>("input")?.value === `server-${original}`, "new server label did not update the input");
    });
  }
  await run("Documents preserve duplicate links across updates", "plan and every distinct report retain their DOM identity with no duplicate-key warnings", async () => {
    await mount("documents");
    const section = [...document.querySelectorAll("section")].find(section => section.querySelector("h2")?.textContent === "Documents");
    check(section, "Documents section missing");
    const rows = () => [...section!.querySelectorAll("li")];
    const first = rows();
    check(first.length === 3, "initial reports collapsed");
    check(new Set(first.map(row => row.querySelector("a")?.href)).size === 1, "fixture URLs differ");
    await click("Reverse reports");
    check(rows()[0] === first[0] && rows()[1] === first[2] && rows()[2] === first[1], "report identity changed on reorder");
    await click("Remove first report");
    check(rows().length === 2 && rows()[1] === first[1], "wrong report removed");
    await click("Add report");
    check(rows().length === 3 && rows()[1] === first[1], "adding a report replaced a prior row");
    check(controls.duplicateKeyWarnings === 0, "duplicate React keys");
  });
  for (const kind of ["hs", "hu", "ho"]) for (const outcome of ["error", "unknown"] as const) {
    await run(`token ${kind} ${outcome}`, "previous successful value/expiry survive a later failure; refresh never issues; explicit retry replaces only on success", async () => {
      await mount("token-issuance");
      const scope = document.getElementById(`issue-${kind}`)!;
      const label = kind === "ho" ? "Issue owner token" : "Issue token";
      const expiry = `#issue-${kind} input[name="expiry"]`;
      input(expiry, "2999-01-01 00:00"); await click(label, scope);
      check(find("Issuing…", scope).disabled && [...scope.querySelectorAll("input")].every(field => field.disabled), "issuance input not locked");
      controls.finishAction("success"); await tick();
      check(scope.textContent?.includes(`${kind}_fixture-1`) && scope.textContent.includes("2999-01-01 00:00 UTC"), "first issuance missing");
      input(expiry, "3000-01-01 00:00"); await click(label, scope);
      check(scope.textContent?.includes("Previous token"), "pending request presents old token as current");
      controls.finishAction(outcome); await tick();
      check(scope.textContent?.includes(`${kind}_fixture-1`) && scope.textContent.includes("2999-01-01 00:00 UTC") && !scope.textContent.includes("3000-01-01 00:00 UTC"), "failure replaced previous result");
      check(scope.querySelector('[role="alert"]')?.textContent === (outcome === "error" ? "Refused" : "Couldn't confirm whether the token was issued. Refresh the list before trying again. If you identify a token whose value you did not receive, revoke it before issuing another."), "failure contract differs");
      check(controls.payloads.length === 2 && controls.refreshes === 1, "failure did not refresh exactly once");
      if (outcome === "unknown") {
        await click("Refresh list", scope);
        check(controls.payloads.length === 2 && controls.refreshes === 2 && scope.textContent?.includes("Previous token"), "refresh resubmitted or cleared prior result");
      }
      await click(label, scope); controls.finishAction("success"); await tick();
      check(controls.payloads.length === 3 && scope.textContent?.includes(`${kind}_fixture-3`) && scope.textContent.includes("3000-01-01 00:00 UTC"), "explicit retry result missing");
      check(!scope.textContent?.includes(`${kind}_fixture-1`) && !scope.textContent?.includes("Previous token"), "success did not replace prior result");
      input(expiry, "invalid"); await click(label, scope);
      check(controls.payloads.length === 3 && scope.textContent?.includes(`${kind}_fixture-3`) && scope.textContent.includes("Previous token"), "invalid input invoked an action or erased a token");
    });
  }
  for (const [firstKind, secondKind] of [["hs", "ho"], ["hu", "ho"]]) for (const outcome of ["error", "unknown"] as const) {
    await run("token independent instances " + firstKind + "/" + secondKind + " " + outcome, "reverse responses keep token, expiry and alerts inside the requesting form without automatic requests", async () => {
      await mount("token-issuance");
      const first = document.getElementById("issue-" + firstKind)!;
      const second = document.getElementById("issue-" + secondKind)!;
      const label = (kind: string) => kind === "ho" ? "Issue owner token" : "Issue token";
      input("#issue-" + firstKind + ' input[name="expiry"]', "2999-01-01 00:00");
      await click(label(firstKind), first); controls.finishAction("success"); await tick();
      input("#issue-" + secondKind + ' input[name="expiry"]', "2999-02-01 00:00");
      await click(label(secondKind), second); controls.finishAction("success"); await tick();
      check(first.textContent?.includes(firstKind + "_fixture-1") && second.textContent?.includes(secondKind + "_fixture-2"), "initial values crossed forms");
      input("#issue-" + firstKind + ' input[name="expiry"]', "3000-01-01 00:00");
      await click(label(firstKind), first); const finishFirst = controls.finishAction;
      input("#issue-" + secondKind + ' input[name="expiry"]', "3000-02-01 00:00");
      await click(label(secondKind), second); const finishSecond = controls.finishAction;
      check(controls.payloads.length === 4 && finishFirst !== finishSecond, "concurrent form requests were shared or duplicated");
      finishSecond(outcome); await tick();
      check(first.textContent?.includes(firstKind + "_fixture-1") && first.textContent.includes("2999-01-01 00:00 UTC"), "another form response replaced the first pending value");
      finishFirst("success"); await tick();
      check(first.textContent?.includes(firstKind + "_fixture-3") && first.textContent.includes("3000-01-01 00:00 UTC"), "first response lost its own value or expiry");
      check(!first.querySelector('[role="alert"]') && !first.textContent.includes(secondKind + "_fixture"), "another form alert or value leaked into the first form");
      check(second.textContent?.includes(secondKind + "_fixture-2") && second.textContent.includes("2999-02-01 00:00 UTC") && second.textContent.includes("Previous token"), "second form lost its prior value");
      check(!second.textContent.includes("3000-02-01 00:00 UTC") && !second.textContent.includes(firstKind + "_fixture"), "successful response crossed forms");
      check(second.querySelector('[role="alert"]')?.textContent?.includes(outcome === "error" ? "Refused" : "Couldn't confirm"), "second form lost its own alert");
      check(controls.payloads.length === 4 && controls.refreshes === 1, "response handling submitted an extra request");
      if (outcome === "unknown") {
        await click("Refresh list", second);
        check(controls.payloads.length === 4 && controls.refreshes === 2 && first.textContent.includes(firstKind + "_fixture-3"), "refresh changed another form or issued again");
      }
    });
  }
  await run("propose roster same instance", "current selection drives display and submission; explicit selection survives reorder/removal/reappearance and reason survives cancel", async () => {
    await mount("propose"); await click("Put on the board");
    const select = document.querySelector<HTMLSelectElement>('select:not([aria-label="Pipeline"])')!;
    check(select.value === "" && find("Put on the board").disabled, "empty roster enabled");
    controls.setRoster(["dev"]); await tick();
    check(document.querySelector('select:not([aria-label="Pipeline"])') === select && select.value === "dev" && !find("Put on the board").disabled, "new roster not derived in same instance");
    input("input", "evidence survives"); await tick();
    controls.setRoster(["dev", "other"]); await tick();
    select.value = "other"; select.dispatchEvent(new Event("change", { bubbles: true })); await tick();
    controls.setRoster(["other", "dev"]); await tick(); check(select.value === "other", "selection lost on reorder");
    controls.setRoster(["dev"]); await tick(); check(select.value === "dev", "missing selection not replaced for display");
    controls.setRoster(["dev", "other"]); await tick(); check(select.value === "other", "explicit selection erased when absent");
    controls.setRoster([]); await tick(); check(select.value === "" && find("Put on the board").disabled, "empty list has old value");
    controls.setRoster(["dev", "other"]); await tick();
    await click("Cancel"); await click("Put on the board");
    check(document.querySelector<HTMLSelectElement>('select:not([aria-label="Pipeline"])')?.value === "other", "cancel cleared explicit selection");
    check(document.querySelector<HTMLInputElement>("input")?.value === "evidence survives", "reason cleared");
    await click("Put on the board");
    check(JSON.stringify(controls.payloads[0]) === JSON.stringify({ key: "KEY", agent: "other", reason: "evidence survives", pipelineId: "default" }), "payload differs from display");
    controls.finishAction("success"); await tick();
  });
  for (const outcome of ["error", "unknown"] as const) await run(`propose pending ${outcome}`, "pending roster changes display but preserve the one captured request; retry uses current roster and retained reason", async () => {
    await mount("propose"); controls.setRoster(["dev"]); await tick(); await click("Put on the board");
    input("input", "captured evidence"); await tick(); await click("Put on the board");
    const snapshot = JSON.stringify(controls.payloads[0]);
    controls.setRoster(["other"]); await tick();
    check(document.querySelector<HTMLSelectElement>('select:not([aria-label="Pipeline"])')?.value === "other", "pending display not current");
    check(controls.payloads.length === 1 && JSON.stringify(controls.payloads[0]) === snapshot && snapshot.includes('"agent":"dev"'), "pending request changed or duplicated");
    controls.finishAction(outcome); await tick();
    check(document.querySelector<HTMLInputElement>("input")?.value === "captured evidence", "failure erased reason");
    await click("Put on the board"); check(controls.payloads.length === 2, "retry not submitted");
    check(JSON.stringify(controls.payloads[1]) === JSON.stringify({ key: "KEY", agent: "other", reason: "captured evidence", pipelineId: "default" }), "retry uses stale roster");
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
  const insertionMenuOpen = () => buttons().some(button => button.textContent === "Add doc-auditor here");
  await run("pipeline insertion menu positions", "end and step menus toggle and replace each other without changing the draft", async () => {
    await mount("pipeline");
    check(!insertionMenuOpen(), "menu starts open");
    await click("Add at end");
    check(insertionMenuOpen() && [...document.querySelectorAll("p")].some(p => p.textContent === "At end"), "end position missing");
    check(!buttons().some(button => button.textContent === "Add gate"), "end position gained a before-step gate");
    await click("Add at end"); check(!insertionMenuOpen(), "end toggle did not close");
    await click("Insert before Plan");
    check(insertionMenuOpen() && find("Insert before Plan").getAttribute("aria-expanded") === "true", "step position missing");
    check([...document.querySelectorAll("p")].some(p => p.textContent === "before Plan"), "step heading missing");
    await click("Add at end");
    check(insertionMenuOpen() && find("Insert before Plan").getAttribute("aria-expanded") === "false", "end did not replace step position");
    await click("Insert before Plan"); await click("Insert before Plan");
    check(!insertionMenuOpen() && find("Save").disabled && controls.payloads.length === 0, "menu toggle changed or saved the draft");
  });
  for (const position of ["end", "before plan"] as const) await run(`pipeline insertion menu selection ${position}`, "selection inserts at the chosen position and closes without saving until requested", async () => {
    await mount("pipeline");
    await click(position === "end" ? "Add at end" : "Insert before Plan");
    await click("Add doc-auditor here");
    check(!insertionMenuOpen() && controls.payloads.length === 0 && !find("Save").disabled, "selection stayed open or saved automatically");
    await click("Save");
    check(controls.payloads.length === 1, "selection was not submitted exactly once");
    const { steps } = (controls.payloads[0] as { definition: { steps: string[] } }).definition;
    check(position === "end" ? steps.at(-1) === "doc-auditor#2" : steps[0] === "doc-auditor#2" && steps[1] === "plan", "selection used the wrong insertion position");
    controls.finishAction("success"); await tick();
  });
  await run("pipeline insertion menu busy", "pending saves block opening and selecting menus and refusal restores the existing menu", async () => {
    await mount("pipeline");
    await click("Add at end"); await click("Add doc-auditor here"); await click("Add at end"); await click("Save");
    const submitted = JSON.stringify(controls.payloads[0]);
    check(find("Saving…").disabled && find("Add at end").disabled, "pending menu trigger active");
    const add = find("Add doc-auditor here"); check(add.disabled, "pending menu choice active");
    add.click(); find("Add at end").click(); await tick();
    check(insertionMenuOpen() && controls.payloads.length === 1 && JSON.stringify(controls.payloads[0]) === submitted, "pending menu changed the submitted graph");
    controls.finishAction("error"); await tick();
    check(insertionMenuOpen() && !find("Add doc-auditor here").disabled, "refusal did not restore menu editing");
    await click("Add doc-auditor here");
    check(!insertionMenuOpen() && controls.payloads.length === 1, "restored selection did not close or resubmitted");
  });
  await run("pipeline insertion menu readonly", "losing write access closes the menu and removes insertion controls without a mutation", async () => {
    await mount("pipeline-page"); await click("Add at end"); check(insertionMenuOpen(), "editable menu missing");
    await click("Read only");
    check(!insertionMenuOpen() && !buttons().some(button => button.textContent === "Add at end" || button.textContent?.trim() === "+"), "readonly insertion remained available");
    check(controls.payloads.length === 0, "readonly change submitted the graph");
    await click("Writable"); check(!insertionMenuOpen(), "restored write access reopened the old menu");
    await click("Insert before Plan"); check(insertionMenuOpen(), "restored step menu unavailable");
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
  const rail = () => document.querySelector<HTMLElement>("#pipeline-page .overflow-x-auto")!;
  const hasNode = (name: string) => [...rail().querySelectorAll("span")].some(node => node.textContent === name);
  await run("pipeline page dirty snapshot", "Scout refresh keeps the draft, old baseline and explicit conflict recovery", async () => {
    await mount("pipeline-page"); await click("Remove", rail());
    await click("Automatic scouting"); controls.finishAction("success"); await tick();
    await click("Receive version 4");
    check(!hasNode("Propose") && hasNode("Verify"), "server snapshot erased the draft");
    check(document.getElementById("pipeline-page")?.textContent?.includes("Version 4"), "server description did not refresh");
    check(find("Save").disabled && find("Discard changes and reload"), "conflict recovery missing");
    check(document.querySelector('[role="alert"]')?.textContent === PIPELINE_STALE, "conflict copy differs");
    check(JSON.stringify(controls.payloads) === "[false]", "snapshot or Scout saved the graph");
  });
  await run("pipeline page clean snapshot", "clean snapshot advances the next CAS baseline and a late older snapshot cannot undo success", async () => {
    await mount("pipeline-page"); await click("Receive version 4");
    check(!hasNode("Verify"), "clean server graph not adopted");
    await click("Remove", rail()); await click("Save");
    check(JSON.stringify(controls.payloads[0]).includes('"expectedVersion":4'), "next save kept old CAS");
    controls.finishAction("success"); await tick();
    await click("Receive original version 3");
    check(!hasNode("Propose") && !hasNode("Verify"), "late old snapshot overwrote the saved graph");
    check(!buttons().some(button => button.textContent === "Discard changes"), "success stayed dirty");
  });
  await run("pipeline page permission changes", "plan/roster/readonly changes preserve edits; readonly discard never mutates", async () => {
    await mount("pipeline-page"); await click("Remove", rail()); await click("Change plan"); await click("Change roster");
    check(!hasNode("Propose") && rail().textContent?.includes("other-dev"), "metadata refresh erased draft or ignored roster");
    await click("Read only"); check(!hasNode("Propose"), "readonly remounted draft");
    check(!buttons().some(button => button.textContent === "Save"), "readonly Save exposed");
    await click("Discard changes"); check(hasNode("Propose"), "readonly local discard unavailable");
    check(controls.payloads.length === 0, "local discard mutated");
    await click("Writable"); await click("Remove", rail()); check(!find("Save").disabled, "writable recovery remained locked");
  });
  await run("pipeline page default plan", "version-zero defaults change only when clean or explicitly discarded", async () => {
    await mount("pipeline-page-default"); await click("Remove", rail()); await click("Change default plan");
    check(!hasNode("Propose") && hasNode("Verify"), "unsaved plan change erased draft");
    await click("Discard changes"); check(hasNode("Propose") && !hasNode("Verify"), "discard did not adopt free default");
    check(controls.payloads.length === 0, "default reconciliation wrote a version");
  });
  for (const outcome of ["success", "error", "stale", "unknown"] as const) await run(`pipeline page pending ${outcome}`, "in-flight snapshot is retained until the owned response; recovery remains explicit", async () => {
    await mount("pipeline-page"); await click("Remove", rail()); await click("Save");
    await click(outcome === "success" ? "Receive version 5" : "Receive version 4");
    check(!hasNode("Propose") && hasNode("Verify") && find("Discard changes").disabled, "pending props replaced or unlocked draft");
    controls.finishAction(outcome); await tick();
    if (outcome === "success") check(hasNode("Propose") && !hasNode("Verify"), "success did not adopt the newer server snapshot");
    else {
      check(!hasNode("Propose") && find("Save").disabled, "failed pending save discarded/retried draft");
      check(document.querySelector('[role="alert"]')?.textContent === (outcome === "unknown" ? PIPELINE_UNKNOWN : PIPELINE_STALE), "pending recovery lost");
      await click("Read only"); check(!find("Discard changes and reload").disabled, "readonly recovery inaccessible");
    }
    check(controls.payloads.length === 1, "pending save resubmitted");
  });
  for (const graphFirst of [false, true]) await run(`pipeline page independent responses ${graphFirst}`, "graph and Scout can settle in either order without changing submitted graph/CAS", async () => {
    await mount("pipeline-page"); await click("Remove", rail()); await click("Save");
    const finishGraph = controls.finishAction; const payload = JSON.stringify(controls.payloads[0]);
    await click("Automatic scouting"); const finishScout = controls.finishAction;
    (graphFirst ? finishGraph : finishScout)("success"); await tick();
    (graphFirst ? finishScout : finishGraph)("success"); await tick();
    check(controls.payloads.length === 2 && JSON.stringify(controls.payloads[0]) === payload, "independent action changed submission");
    check(!hasNode("Propose") && find("Save").disabled, "successful draft was lost or remained dirty");
  });
  for (const outcome of ["success", "error", "stale", "unknown"] as const) await run(`pipeline page project switch ${outcome}`, "old-project replies cannot change the new project's draft, recovery or lock", async () => {
    await mount("pipeline-page"); await click("Remove", rail()); await click("Save");
    const finishOld = controls.finishAction; await click("Switch project");
    check(hasNode("Propose"), "new project inherited old draft");
    finishOld(outcome); await tick();
    check(!document.querySelector('[role="alert"]'), "old response leaked recovery");
    await click("Remove", rail()); check(!find("Save").disabled, "old response locked new project");
    check(controls.payloads.length === 1, "project switch mutated");
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
  }
  const initialLists = () => githubControls.requestRecords.filter(request => request.path.endsWith("/repositories"));
  const releaseInitial = async (...args: Parameters<typeof githubControls.releaseInitial>) => {
    githubControls.releaseInitial(...args); await tick(); await tick();
  };
  const hasPrivateChoice = () => buttons().some(button => button.textContent?.includes("private-org/private-service"));
  const hasSessionFailure = () => document.body.textContent?.includes("Sign in again before creating a project");
  for (const endpoint of ["cancel", "draft"] as const) await run(`initial list independent of ${endpoint}`, "the list appears before held draft I/O and completion never reloads it", async () => {
    await mount(`private-initial-${endpoint}`);
    check(initialLists().length === 1 && hasPrivateChoice(), "initial list waited for draft I/O");
    check(githubControls.pendingCount() === 1, "draft request was not held");
    await releaseInitial(endpoint);
    check(initialLists().length === 1 && githubControls.pendingCount() === 0, "draft completion reloaded or leaked a request");
    if (endpoint === "draft") {
      check(document.querySelector<HTMLInputElement>('input[name="slug"]')?.value === "saved-slug", "untouched draft was not restored");
      const acknowledgements = githubControls.requestRecords.filter(request => request.method === "POST" && request.path.endsWith("/draft"));
      check(acknowledgements.length === 1 && JSON.stringify(acknowledgements[0].body) === JSON.stringify({ id: "f44789cb-40c6-42cb-bdbe-c0995bcaa07c", generation: 4 }), "server acknowledgement generation changed");
    }
  });
  await run("initial list preserves cancel before draft", "list I/O is independent while cancellation still precedes restoration", async () => {
    await mount("private-initial-serial");
    check(hasPrivateChoice() && initialLists().length === 1, "list is blocked by cancellation");
    check(!githubControls.requestRecords.some(request => request.path.endsWith("/draft")), "draft bypassed pending cancellation");
    await releaseInitial("cancel");
    check(githubControls.requestRecords.some(request => request.method === "GET" && request.search.includes("flowId=")), "draft did not follow cancellation");
    await releaseInitial("draft");
    check(initialLists().length === 1, "serial draft flow requested another list");
  });
  await run("initial choice beats late restoration", "a choice from the early list preserves user inputs and authorized provenance", async () => {
    await mount("private-initial-draft"); await click("private-org/private-service · Private release"); await click("Edit");
    input('input[name="name"]', "Early choice"); input('input[name="slug"]', "early-slug"); input('input[name="branch"]', "early-branch"); await tick();
    await releaseInitial("draft");
    check(document.querySelector<HTMLInputElement>('input[name="slug"]')?.value === "early-slug" && document.querySelector<HTMLInputElement>('input[name="name"]')?.value === "Early choice" && document.querySelector<HTMLInputElement>('input[name="branch"]')?.value === "early-branch", "late draft overwrote early edits");
    await click("Create project");
    const submitted = controls.submissions[0];
    check(submitted?.repositorySource === "authorized" && submitted.repositoryId === "99" && submitted.installationId === "9" && submitted.repositoryPage === "1" && submitted.connectionRevision === "4", "early list lost submission provenance");
  });
  for (const first of ["list", "draft"] as const) await run(`initial ${first} session loss`, "a late peer response cannot restore a session-expired form even if abort is ignored", async () => {
    await mount("private-initial-late");
    const peer = first === "list" ? "draft" : "list";
    await releaseInitial(first, "unauthenticated");
    check(hasSessionFailure(), "session loss did not leave the form");
    await releaseInitial(peer);
    check(hasSessionFailure() && !document.querySelector('input[name="slug"]') && !document.querySelector('input[name="repositoryId"]'), "late peer revived the old form");
    check(githubControls.requestRecords.every(request => request.settled), "late response was not settled");
  });
  await run("initial cancellation detects session loss", "a cancellation 401 invalidates an already displayed list", async () => {
    await mount("private-initial-cancel-both"); await releaseInitial("list");
    check(hasPrivateChoice(), "list was not displayed before cancellation");
    await releaseInitial("cancel", "unauthenticated");
    check(hasSessionFailure() && !hasPrivateChoice(), "cancel 401 left private choices visible");
  });
  await run("initial reauthorization fences restoration", "a reauthorization result prevents a late authorized draft from restoring selection", async () => {
    await mount("private-initial-both"); await releaseInitial("list", "reauth-required");
    await releaseInitial("draft");
    check(find("Reconnect repository list") && !document.querySelector('input[name="repositoryId"]'), "late draft restored expired authorization");
    check(!hasSessionFailure(), "reauthorization was treated as account session loss");
  });
  for (const outcome of ["unauthenticated", "unavailable", "network"] as const) await run(`initial stale draft ${outcome}`, "Start over invalidates late failure responses and preserves the current form", async () => {
    await mount("private-initial-draft"); await click("private-org/private-service · Private release"); await click("Start over");
    await releaseInitial("draft", outcome);
    check(!hasSessionFailure() && document.querySelector("form"), "old failure expired the current form");
    check(!document.body.textContent?.includes("Your draft couldn't be restored") && !document.querySelector('input[name="repositoryId"]'), "old failure changed reset state");
  });
  await run("initial stale cancel preserves new cleanup", "an old cancellation cannot expire the form or erase a newer cancel key", async () => {
    await mount("private-initial-cancel"); await click("private-org/private-service · Private release");
    const newer = "c40a5984-f8f3-4a23-aac5-301f6d6ee25b";
    sessionStorage.setItem("stagekeeper.github.flow.fixture-private-user", newer);
    await click("Start over");
    await releaseInitial("cancel", "unauthenticated");
    check(!hasSessionFailure() && sessionStorage.getItem("stagekeeper.github.cancel.fixture-private-user") === newer, "old cancel changed current session or storage");
    await releaseInitial("cancel");
    check(sessionStorage.getItem("stagekeeper.github.cancel.fixture-private-user") === null, "current cancellation did not clear its key");
  });
  await run("initial late list after manage", "a canceled list cannot repopulate choices after a newer connection operation", async () => {
    await mount("private-initial-late"); await click("Manage repository access");
    const record = initialLists()[0];
    check(record.aborted, "Manage did not abort the active list");
    await releaseInitial("list"); await releaseInitial("draft", "unauthenticated");
    check(record.settled && !hasPrivateChoice() && !hasSessionFailure(), "stale list or draft changed the newer operation");
  });
  await run("initial draft after disconnect", "confirmed disconnection cannot be undone by a late draft", async () => {
    await mount("private-initial-late"); await releaseInitial("list"); await click("private-org/private-service · Private release");
    await click("Disconnect repository list"); await click("Confirm list disconnect"); await releaseInitial("draft");
    check(!document.querySelector('input[name="repositoryId"]') && !hasPrivateChoice() && find("Connect private repositories"), "late draft revived disconnected selection");
  });
  for (const outcome of ["unavailable", "invalid", "invalid-value", "network"] as const) await run(`initial list ${outcome}`, "list failures settle loading and preserve URL input and retry", async () => {
    await mount("private-initial-list"); await releaseInitial("list", outcome);
    check(!find("Reload repository list").disabled && !hasPrivateChoice(), "failed list retained loading or choices");
    await click("Paste a repository URL");
    check(document.querySelector('input[inputmode="url"]') && !hasSessionFailure(), "list failure removed manual input");
  });
  for (const endpoint of ["cancel", "draft"] as const) for (const outcome of ["unavailable", "invalid", "network"] as const) await run(`initial ${endpoint} ${outcome}`, "draft cleanup failures leave the independent list usable without another list request", async () => {
    await mount(`private-initial-${endpoint}`); await releaseInitial(endpoint, outcome);
    check(initialLists().length === 1 && hasPrivateChoice() && !hasSessionFailure(), "draft failure blocked or reloaded the list");
  });
  await run("initial malformed draft value", "an invalid draft body never restores form data", async () => {
    await mount("private-initial-draft"); await releaseInitial("draft", "invalid-value");
    check(hasPrivateChoice() && !document.querySelector('input[name="repositoryId"]') && document.querySelector<HTMLInputElement>('input[name="slug"]')?.value === "", "invalid draft was applied");
  });
  for (const mode of ["off", "disconnected"] as const) await run(`initial ${mode} list policy`, "an unavailable or disconnected picker does not automatically request a list", async () => {
    await mount(`private-initial-${mode}`);
    check(initialLists().length === 0 && controls.submissions.length === 0, "disabled connection started a list or registration");
  });
  for (const mode of ["empty", "partial"] as const) await run(`initial ${mode} list response`, "empty and partial responses retain the existing guidance and selection policy", async () => {
    await mount(`private-initial-${mode}`);
    check(!find("Reload repository list").disabled, "list response left loading active");
    if (mode === "empty") check(!hasPrivateChoice() && document.body.textContent?.includes("No repositories loaded"), "empty state guidance missing");
    else {
      check(hasPrivateChoice() && document.body.textContent?.includes("Some repository access couldn't be checked") && document.body.textContent?.includes("2 archived or unsupported"), "partial state was hidden");
      await click("private-org/private-service · Private release");
      check(document.querySelector<HTMLInputElement>('input[name="repositoryId"]')?.value === "99", "partial list selection failed");
    }
  });
  await run("initial unmount and event cleanup", "unmount aborts initial I/O and remount has exactly one listener for each refresh event", async () => {
    await mount("private-initial-both");
    const oldRequests = [...githubControls.requestRecords], oldPending = githubControls.pendingCount;
    await mount("private-initial-ready");
    check(oldRequests.length === 2 && oldRequests.every(request => request.aborted && request.settled) && oldPending() === 0, "old initial requests survived unmount");
    for (const event of ["focus", "pageshow", "visibilitychange"]) {
      const before = initialLists().length;
      (event === "visibilitychange" ? document : window).dispatchEvent(new Event(event)); await tick();
      check(initialLists().length === before + 1, `${event} retained or duplicated an old listener`);
    }
  });
  await run("initial strict effect lifetime", "StrictMode discards the first effect lifetime and the current lifetime settles without duplicate completion reloads", async () => {
    await mount("private-initial-strict");
    const attempts = process.env.NODE_ENV === "development" ? 2 : 1;
    const drafts = githubControls.requestRecords.filter(request => request.method === "GET" && request.search.includes("flowId="));
    check(drafts.length === attempts && initialLists().length === 1, "invalidated effect started an initial list");
    if (attempts === 2) check(drafts[0].aborted && drafts[0].settled, "first StrictMode draft stayed live");
    check(githubControls.pendingCount() === 2, "StrictMode retained old draft or list requests");
    await releaseInitial("list"); await releaseInitial("draft");
    check(initialLists().length === 1 && githubControls.pendingCount() === 0 && document.querySelector<HTMLInputElement>('input[name="slug"]')?.value === "saved-slug", "current StrictMode lifetime failed to settle");
    const before = initialLists().length;
    window.dispatchEvent(new Event("focus")); await tick();
    check(initialLists().length === before + 1, "StrictMode duplicated refresh listeners");
    await releaseInitial("list");
  });
  await run("private consent and form isolation", "consent is explicit and helper buttons never submit registration", async () => {
    await mount("private-consent");
    check(githubControls.requests.every(path => !path.includes("/start")), "authorization started without consent");
    await click("Connect private repositories");
    check(document.body.textContent?.includes("No code access"), "permission explanation absent");
    check(githubControls.requests.every(path => !path.includes("/start")), "first click skipped consent");
    await click("Continue to GitHub");
    check(githubControls.requests.filter(path => path.includes("/start")).length === 1 && controls.submissions.length === 0, "helper submitted the root form");
  });
  await run("private Edit preserves provenance", "branch and name edits retain authorized identity in actual FormData", async () => {
    await mount("private-ready"); await click("private-org/private-service · Private release"); await click("Edit");
    input('input[name="name"]', "My name"); input('input[name="branch"]', "custom-branch"); await tick();
    await click("Create project");
    check(controls.submissions[0]?.repositorySource === "authorized" && controls.submissions[0]?.repositoryId === "99" && controls.submissions[0]?.branch === "custom-branch", "authorized provenance lost through Edit");
  });
  await run("private null default branch", "missing metadata needs explicit branch without Contents access", async () => {
    await mount("private-null"); await click("private-org/private-service · Private");
    check(document.querySelector<HTMLInputElement>('input[name="branch"]')?.value === "" && find("Create project").disabled, "missing branch became main");
    input('input[name="branch"]', "chosen"); await tick(); check(!find("Create project").disabled, "explicit branch not accepted");
  });
  await run("private newer edits beat restoration", "delayed restoration preserves new owner, slug, name and branch", async () => {
    await mount("private-restoring"); await click("Paste a URL instead"); input('input[inputmode="url"]', "https://github.com/current/new"); await tick();
    await click("Edit"); input('input[name="slug"]', "current-slug"); input('input[name="name"]', "Current name"); input('input[name="branch"]', "current-branch"); await tick();
    githubControls.releaseDraft(); await tick(); await tick();
    check(document.querySelector<HTMLInputElement>('input[name="slug"]')?.value === "current-slug" && document.querySelector<HTMLInputElement>('input[name="name"]')?.value === "Current name" && document.querySelector<HTMLInputElement>('input[name="branch"]')?.value === "current-branch", "late draft replaced local edits");
    check(document.querySelector<HTMLInputElement>('input[name="owner"]')?.value === "current", "late draft restored private identity");
  });
  await run("private session-loss restoration race", "late draft cannot restore after a newer unauthenticated request", async () => {
    await mount("private-session-race"); githubControls.expire(); window.dispatchEvent(new Event("focus")); await tick();
    githubControls.releaseDraft(); await tick(); await tick();
    check(!document.querySelector('input[name="slug"]') && !document.querySelector('input[name="repositoryId"]'), "private draft restored after session loss");
    check(document.body.textContent?.includes("Sign in again"), "session recovery absent");
  });
  await run("private canceled loading settles", "failed Manage and Start over during pagination leave reload usable", async () => {
    await mount("private-loading"); await click("Manage repository access");
    check(!find("Reload repository list").disabled && !document.body.textContent?.includes("Loading repositories…"), "failed manage left loading stuck");
    await mount("private-pagination"); await click("private-org/private-service · Private release"); await click("Load more"); await click("Start over");
    check(!find("Reload repository list").disabled && !document.body.textContent?.includes("Loading repositories…"), "Start over left loading stuck");
  });
  await run("private late creation after session loss", "an old creation response cannot reveal its token after the account is invalidated", async () => {
    await mount("private-ready"); await click("private-org/private-service · Private release"); await click("Create project");
    githubControls.expire(); window.dispatchEvent(new Event("focus")); await tick(); controls.finishRegistration(); await tick();
    check(!document.body.textContent?.includes("hs_fixture-created") && document.body.textContent?.includes("Sign in again"), "old-session token was revealed");
  });
  await run("private restoration focus and current failure", "focus follows the restoration event and later failures replace old success guidance", async () => {
    await mount("private-focus"); githubControls.releaseDraft(); await tick(); await tick();
    check(document.activeElement?.getAttribute("role") === "status" && document.activeElement.textContent?.includes("Loading repositories"), "restoration focus depended on success wording");
    githubControls.releaseList(); await tick(); githubControls.failList(); await click("Reload repository list");
    check(document.querySelector('[role="status"]')?.textContent?.includes("Fixture repository reload failed"), "old success hid query failure");
  });
  await run("private refresh and disconnect", "refresh preserves edits; confirmed disconnect clears selected identity and preserves project details", async () => {
    await mount("private-ready"); await click("private-org/private-service · Private release"); await click("Edit");
    input('input[name="slug"]', "mine"); input('input[name="name"]', "Keep name"); input('input[name="branch"]', "keep-branch"); await tick();
    githubControls.changeBranch(); await click("Reload repository list");
    check(document.querySelector<HTMLInputElement>('input[name="branch"]')?.value === "keep-branch" && document.querySelector<HTMLInputElement>('input[name="connectionRevision"]')?.value === "5", "refresh overwrote input or retained stale revision");
    await click("Disconnect repository list"); await click("Confirm list disconnect");
    check(!document.querySelector('input[name="repositoryId"]') && document.querySelector<HTMLInputElement>('input[name="owner"]')?.value === "" && document.querySelector<HTMLInputElement>('input[name="name"]')?.value === "Keep name", "disconnect retained private selection or erased project details");
  });
  const listRequests = () => githubControls.requests.filter(path => path === "GET /api/github/repositories").length;
  const beginCooldown = async () => {
    await mount("private-cooldown"); await click("private-org/private-service · Private release");
    githubControls.limitList(); await click("Reload repository list");
    check(find("Reload repository list").disabled && document.querySelector('[role="status"]')?.textContent === "Wait before retrying repositories.", "rate limit did not lock retry with its message");
    check(githubControls.cooldownTimerCount() === 1, "cooldown timer missing");
  };
  await run("private cooldown event policy", "all visibility/focus events suppress list requests while session probes remain active; expiry only unlocks retry", async () => {
    await beginCooldown(); const calls = listRequests();
    for (const [target, event] of [[window, "focus"], [window, "pageshow"], [document, "visibilitychange"]] as const) {
      target.dispatchEvent(new Event(event)); await tick();
      check(listRequests() === calls, `${event} bypassed cooldown`);
      check(document.querySelector('[role="status"]')?.textContent === "Wait before retrying repositories.", `${event} replaced rate guidance`);
    }
    check(githubControls.requests.filter(path => path === "GET /api/github/connection/draft").length === 3, "session probes were omitted or repeated");
    await click("Reload repository list"); check(listRequests() === calls, "disabled retry requested a list");
    await click("Start over"); check(find("Reload repository list").disabled, "Start over bypassed cooldown");
    githubControls.allowList(); githubControls.expireCooldown(); await tick();
    check(listRequests() === calls && !find("Reload repository list").disabled, "expiry fetched or failed to unlock retry");
    await click("Reload repository list");
    check(listRequests() === calls + 1 && githubControls.cooldownTimerCount() === 0, "explicit retry did not run once");
  });
  for (const failure of ["rate", "unavailable"] as const) await run(`private cooldown probe ${failure}`, "a failed session probe leaves the list deadline and rate guidance unchanged", async () => {
    await beginCooldown(); const calls = listRequests();
    if (failure === "rate") githubControls.limitProbe(); else githubControls.failProbe();
    window.dispatchEvent(new Event("focus")); await tick();
    check(listRequests() === calls && find("Reload repository list").disabled && githubControls.cooldownTimerCount() === 1, "probe error altered cooldown");
    check(document.querySelector('[role="status"]')?.textContent === "Wait before retrying repositories.", "probe error replaced list guidance");
  });
  await run("private cooldown session loss", "an expired account still leaves the form during cooldown and clears the timer", async () => {
    await beginCooldown(); const calls = listRequests();
    githubControls.expire(); window.dispatchEvent(new Event("focus")); await tick();
    check(listRequests() === calls && document.body.textContent?.includes("Sign in again before creating a project"), "cooldown hid session loss");
    check(!document.querySelector('input[name="repositoryId"]') && githubControls.cooldownTimerCount() === 0, "lost session retained a selection or timer");
  });
  await run("private cooldown stale probe", "Start over invalidates a late session response without bypassing the list deadline", async () => {
    await beginCooldown(); githubControls.holdProbe(); window.dispatchEvent(new Event("focus")); await tick();
    check(githubControls.pendingCount() === 1, "session probe not held");
    await click("Start over"); githubControls.releaseProbe(); await tick();
    check(!document.body.textContent?.includes("Sign in again before creating a project") && find("Reload repository list").disabled, "stale probe replaced the current form");
  });
  await run("private cooldown delayed timer", "an elapsed absolute deadline allows refresh even before the delayed timer fires", async () => {
    await beginCooldown(); const calls = listRequests();
    githubControls.allowList(); githubControls.elapseCooldown(); window.dispatchEvent(new Event("focus")); await tick();
    check(listRequests() === calls + 1 && !find("Reload repository list").disabled && githubControls.cooldownTimerCount() === 0, "delayed timer trapped the list");
  });
  await run("private cooldown unmount cleanup", "unmount cancels the deadline and held probe; the next form starts without stale state", async () => {
    await beginCooldown(); githubControls.holdProbe(); window.dispatchEvent(new Event("focus")); await tick();
    const pendingCount = githubControls.pendingCount, timerCount = githubControls.cooldownTimerCount, release = githubControls.releaseProbe;
    cleanup(); await tick(); release(); await tick();
    check(pendingCount() === 0 && timerCount() === 0, "fixture retained a probe or timer");
    await mount("private-ready"); check(!find("Reload repository list").disabled && !document.body.textContent?.includes("Sign in again before creating a project"), "old state leaked into new mount");
  });
  await run("private operation messages", "opening and disconnecting announce different pending actions and retain button locks", async () => {
    await mount("private-operation"); await click("private-org/private-service · Private release");
    await click("Manage repository access");
    check(document.querySelector('[role="status"]')?.textContent === "Opening repository connection…" && find("Disconnect repository list").disabled, "opening state/lock wrong");
    githubControls.releaseStart(); await tick();
    await click("Disconnect repository list"); await click("Confirm list disconnect");
    check(document.querySelector('[role="status"]')?.textContent === "Disconnecting repository list…" && find("Manage repository access").disabled, "disconnect announced opening or unlocked controls");
    githubControls.releaseDisconnect(); await tick();
    check(document.body.textContent?.includes("Repository list stopped here.") && !document.querySelector('input[name="repositoryId"]'), "disconnect did not settle");
  });
  await run("private operation stale finally", "an old opening response cannot clear a newer pending operation after Start over", async () => {
    await mount("private-operation"); await click("private-org/private-service · Private release");
    await click("Manage repository access"); await click("Start over");
    await click("Manage repository access"); githubControls.releaseStart(); await tick();
    check(document.querySelector('[role="status"]')?.textContent === "Opening repository connection…" && find("Manage repository access").disabled, "old finally unlocked the new operation");
    githubControls.releaseStart(); await tick(); check(!find("Manage repository access").disabled, "new operation did not settle");
  });
  await run("private operation session loss", "session loss unmounts a pending disconnect and a late response cannot restore it", async () => {
    await mount("private-operation"); await click("Disconnect repository list"); await click("Confirm list disconnect");
    githubControls.expire(); window.dispatchEvent(new Event("focus")); await tick();
    githubControls.releaseDisconnect(); await tick();
    check(document.body.textContent?.includes("Sign in again before creating a project") && !document.body.textContent?.includes("Repository list stopped here."), "late disconnect changed the expired form");
  });
  const output = document.createElement("pre"); output.id = "acceptance-results"; output.textContent = JSON.stringify(results, null, 2);
  document.querySelector("#acceptance-results")?.remove(); document.body.append(output);
  await fetch("/results", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(results) });
}

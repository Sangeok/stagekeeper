import { frontendUx } from "./frontend-ux-browser";

type Result = { case: string; expected: string; observed: string; status: "Pass" | "Fail" };
const check = (value: unknown, message: string): void => { if (!value) throw new Error(message); };
const text = (node: ParentNode = document.body): string => node.textContent?.replace(/\s+/g, " ") ?? "";
const scope = (): HTMLElement => document.getElementById("frontend-ux")!;
const button = (name: string, parent: ParentNode = scope()): HTMLButtonElement => {
  const found = [...parent.querySelectorAll<HTMLButtonElement>("button")].find(node => node.getAttribute("aria-label") === name || text(node).trim() === name);
  if (!found) throw new Error(`Missing button: ${name}`);
  return found;
};
const frame = (): Promise<void> => new Promise(resolve => requestAnimationFrame(() => resolve()));

async function waitFor(predicate: () => unknown, message: string): Promise<void> {
  const deadline = performance.now() + 4_000;
  while (!predicate()) {
    if (performance.now() > deadline) throw new Error(message);
    await frame();
  }
}

async function click(name: string, parent?: ParentNode): Promise<void> {
  button(name, parent).click();
  await frame();
}

async function choose(select: HTMLSelectElement, value: string): Promise<void> {
  select.value = value;
  select.dispatchEvent(new Event("change", { bubbles: true }));
  await frame();
}

function referenceCard(name = "Check"): HTMLElement {
  const group = [...scope().querySelectorAll<HTMLElement>('[role="group"]')].find(node => node.getAttribute("aria-label") === name);
  check(group, "Reference group missing");
  return group!;
}

export async function runFrontendUxAcceptance(render: (mode: string) => void, cleanup: () => void): Promise<void> {
  const results: Result[] = [];
  const run = async (name: string, expected: string, test: () => Promise<void>): Promise<void> => {
    try { await test(); results.push({ case: name, expected, observed: expected, status: "Pass" }); }
    catch (error) { results.push({ case: name, expected, observed: error instanceof Error ? error.message : "Unknown failure", status: "Fail" }); }
    finally { cleanup(); await frame(); }
  };
  const mount = async (mode = "ux-pipeline"): Promise<void> => {
    render(mode);
    await waitFor(() => scope(), "Fixture did not mount");
    await frame();
  };
  const editor = async (): Promise<void> => {
    await mount();
    await click("Delivery");
    await waitFor(() => scope().querySelector('[aria-label="Pipeline editor"]'), "Editor missing");
  };
  const addAudit = async (): Promise<void> => {
    await click("Add at end");
    await click("Add Doc audit here");
  };

  await run("catalog and rules", "catalog begins without an editor; a refused default change releases the panel and restores focus", async () => {
    await mount();
    check(text().includes("All pipelines") && !scope().querySelector('[aria-label="Pipeline editor"]'), "Catalog changed");
    const trigger = button("Run rules"); trigger.focus();
    await click("Run rules");
    const dialog = scope().querySelector<HTMLDialogElement>("dialog")!;
    check(dialog?.open, "Rules dialog did not open");
    check(!text(dialog).includes("Automatic scouting"), "Removed automation UI returned");
    await choose(dialog.querySelector('select[aria-label="Default selection"]')!, "delivery");
    check(frontendUx.calls.length === 1 && frontendUx.calls[0].kind === "default", "Wrong setting Action");
    check(button("Close", dialog).disabled, "Pending panel can close");
    frontendUx.finish("error");
    await waitFor(() => text(dialog).includes("Fixture refusal"), "Error missing");
    await click("Close", dialog);
    check(!scope().querySelector("dialog") && document.activeElement === trigger, "Rules focus restoration changed");
  });

  await run("reference DOM identity", "same reference details and focused button survive a newer clean snapshot", async () => {
    await mount("ux-rail");
    const card = referenceCard(), details = card.querySelector("details")!;
    details.open = true;
    const open = button("Open pipeline", card); open.focus();
    frontendUx.receive(2);
    await frame(); await frame();
    check(referenceCard() === card && card.querySelector("details") === details && details.open, "Reference was remounted");
    check(document.activeElement === open, "Reference focus was lost");
    await click("Open pipeline", card);
    check(JSON.stringify(frontendUx.calls) === JSON.stringify([{ kind: "open", input: "check" }]), "Reference navigation changed");
  });

  await run("reference expansion and absence", "expanded references show QA; missing references retain the error and unknown step count", async () => {
    await mount("ux-rail");
    const toggle = scope().querySelector<HTMLInputElement>('input[type="checkbox"]')!;
    toggle.click(); await frame();
    check(text(referenceCard()).includes("QA"), "Expanded reference missing");
    toggle.click(); await frame();
    frontendUx.receive(2, true); await frame(); await frame();
    check(text(scope()).includes("archived or missing"), "Missing reference error changed");
    check(text(referenceCard("check")).includes("? steps"), "Missing reference summary changed");
  });

  await run("reference readonly", "read-only references keep details and open navigation while hiding Remove", async () => {
    await mount("ux-rail"); frontendUx.access(false); await frame();
    const card = referenceCard();
    check(card.querySelector("details"), "Details disappeared");
    check(![...card.querySelectorAll("button")].some(node => text(node) === "Remove"), "Readonly remove remains");
    check(!button("Open pipeline", card).disabled, "Readonly navigation disabled");
  });

  await run("conflict ref target", "conflict action scrolls the registered conflicting element with the existing alignment", async () => {
    await mount("ux-rail");
    const original = HTMLElement.prototype.scrollIntoView;
    const calls: { target: HTMLElement; options: unknown }[] = [];
    HTMLElement.prototype.scrollIntoView = function (options) { calls.push({ target: this, options }); };
    try {
      await click("Add at end");
      await click("Show conflicting steps for Check");
      check(calls.length === 1 && scope().contains(calls[0].target), "Conflict target not registered");
      check(JSON.stringify(calls[0].options) === JSON.stringify({ block: "nearest", inline: "center" }), "Scroll alignment changed");
      check(calls[0].target.getAttribute("aria-describedby") && text(scope()).includes("Cannot add Check here"), "Conflict description missing");
      check(frontendUx.calls.length === 0, "Conflict inspection wrote data");
    } finally { HTMLElement.prototype.scrollIntoView = original; }
  });

  for (const outcome of ["success", "error", "stale", "unknown"] as const) {
    await run(`save ${outcome}`, "one captured save, disabled pending controls and the existing recovery result", async () => {
      await editor(); await addAudit();
      await click("Save");
      check(frontendUx.calls.length === 1 && frontendUx.calls[0].kind === "save", "Save not captured once");
      check(button("Saving…").disabled && button("Discard changes").disabled, "Pending save unlocked");
      await click("Saving…"); check(frontendUx.calls.length === 1, "Duplicate save");
      frontendUx.finish(outcome);
      await waitFor(() => !text(scope()).includes("Saving…"), "Save did not settle");
      if (outcome === "success") check(frontendUx.refreshes === 1, "Success refresh changed");
      else if (outcome === "error") check(!button("Save").disabled, "Explicit refusal cannot retry");
      else {
        check(button("Save").disabled && button("Discard changes and reload"), "Ambiguous/stale save can retry");
        check(scope().querySelector('[role="alert"]'), "Recovery guidance missing");
      }
    });
  }

  await run("dirty navigation", "declined navigation retains the draft and accepted navigation returns to catalog", async () => {
    await editor(); await addAudit();
    const original = window.confirm;
    try {
      window.confirm = () => false; await click("← All pipelines");
      check(scope().querySelector('[aria-label="Pipeline editor"]'), "Declined navigation left editor");
      window.confirm = () => true; await click("← All pipelines");
      check(scope().querySelector('[aria-label="Pipelines"]'), "Accepted navigation failed");
    } finally { window.confirm = original; }
  });

  await run("catalog history", "browser back returns to the catalog and removes the selected pipeline query", async () => {
    await editor();
    history.back();
    await waitFor(() => scope().querySelector('[aria-label="Pipelines"]'), "Back did not restore catalog");
    check(!new URLSearchParams(location.search).has("pipeline"), "Catalog query did not restore");
  });

  for (const change of ["project", "unmount"] as const) await run(`late save ${change}`, "settling an old request cannot refresh or replace the new target", async () => {
    await editor(); await addAudit(); await click("Save");
    if (change === "project") frontendUx.identity("two"); else frontendUx.hide();
    await frame(); await frame();
    frontendUx.finish("success"); await frame(); await frame();
    check(frontendUx.refreshes === 0, "Old save refreshed a new target");
    check(change === "project" ? scope().dataset.project === "two" : text(scope()).includes("unmounted"), "New target replaced");
  });

  for (const operation of ["start", "stop", "approve"] as const) await run(`run ${operation}`, "pending labels, panel locks and unknown-outcome guidance remain unchanged", async () => {
    await editor(); frontendUx.projectRun = operation !== "start";
    await click("Run");
    await waitFor(() => !!scope().querySelector("dialog select") || text(scope()).includes("Active pipeline:"), "Run preparation missing");
    const dialog = scope().querySelector<HTMLDialogElement>("dialog")!;
    if (operation === "start") await choose(dialog.querySelector("select")!, "backlog:work");
    const label = operation === "start" ? "Start run" : operation === "stop" ? "Stop new work" : "Approve before Plan";
    await click(label, dialog);
    check(frontendUx.calls.at(-1)?.kind === operation, "Wrong Run operation");
    check(button("Starting…", dialog).disabled && button("Close", dialog).disabled, "Current pending presentation changed");
    frontendUx.finish("unknown");
    await waitFor(() => !!dialog.querySelector('[role="alert"]'), "Run recovery missing");
    check(button("Start run", dialog).disabled && !button("Close", dialog).disabled, "Unknown recovery lock changed");
    await click("Close", dialog);
    check(!scope().querySelector("dialog"), "Run cannot close after unknown");
  });

  await fetch("/results", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(results) });
  Object.assign(window, { frontendUxResults: results });
}

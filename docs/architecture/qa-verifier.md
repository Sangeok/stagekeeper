# Browser QA verifier

`qa-verifier` is an independent, item-bound report agent on Pro and Max. The optional
`qa` node goes between `implement` and `accept`. Existing versions and default graphs
remain unchanged. Add **QA** in the Pipeline editor for new items; `before-qa` is optional.

Entering QA records implementation completion as `done`, without recording acceptance.
Only the main loop accepts at `accept`, after its existing five checks. Failed QA leaves
the item unaccepted. The owner can reopen implementation/planning through the existing
board action, creating fresh entries and invalidating old execution receipts. For an
environment problem with unchanged code, explicitly retry QA in the current entry.
Codex uses `harness-codex dispatch --session <session> --key <key> --retry-qa yes`.
Include `--briefing <file>` for every QA dispatch/resume. This minimal JSON contains only
`targetCommit` and `testBuildIdentity`, describing the observed test build/revision check.
The helper verifies the target against the developer's report and current tracked product
files. QA independently checks the running page identity. It receives no previous verdict.

## Inputs and activation

Add explicit test settings to the consuming repository's `harness.json`:

```json
{
  "qa": {
    "environment": "test",
    "baseUrl": "http://127.0.0.1:3000",
    "mcpUrl": "http://127.0.0.1:8931/mcp",
    "scenariosPath": "docs/qa/scenarios.md",
    "artifactsDir": "C:/Temp/stagekeeper-qa"
  }
}
```

The scenario file names required flows, expected results, test build/revision identity,
disposable fixtures/accounts, permitted mutations and cleanup. Start the target build
separately. Never infer QA from release settings; the parser rejects the release origin.
The main loop supplies evidence that the tested build corresponds to the implementation
report commit. Missing revision identity, configuration, tools or required checks are
blockers. Successful unit tests/code review do not replace browser observations.

Start a dedicated [Playwright MCP](https://github.com/microsoft/playwright-mcp) process.
Native Windows with Edge is rehearsed with `@playwright/mcp@0.0.83`:

```powershell
npx.cmd --yes @playwright/mcp@0.0.83 --headless --browser msedge --isolated --host 127.0.0.1 --allowed-hosts 127.0.0.1:8931 --port 8931 --output-dir C:/Temp/stagekeeper-qa
```

Keep the process dedicated to the test repository and stop it after QA.
Use an existing writable temporary directory for artifactsDir and the matching --output-dir;
on other platforms choose an absolute temporary path. Current MCP snapshots are files.
The Codex broker reads only bounded automatic snapshot files inside that explicit directory
and includes their contents in the tool response. It rejects symlinks and escaping names.
Browser setup is a prerequisite for this optional capability; ordinary roles need no browser dependency.
The owner must isolate test infrastructure and prevent production side effects. Origin
checks and allowed-origin flags are not a network security boundary: redirects/subrequests
can occur before the next observation. Use disposable accounts, never a personal profile.

After server/template rollout, rerun client init. Claude gets a managed `harness_qa_browser`
HTTP entry only when QA is configured. A differing existing entry is preserved and init
refuses the conflict. Codex never inherits global browser MCP configuration: the fresh
role helper proxies the explicit loopback endpoint. Claude follows the role's target
policy; Codex additionally checks the origin before/after actions through its broker.

## Authority and evidence

QA reads the requirement, approved plan and implementation report in a fresh context.
It writes only `docs/agents/qa-verifier/<KEY>.md` and scratch evidence. It has no shell,
owner, transition, approval, acceptance, backlog mutation or nested-agent tools. Its one
file-writing tool is `Write`, and a Claude tool list cannot scope a tool to a path: on Claude
the role rule limits it to the report, and the main loop fingerprints the working tree before
dispatch and compares it, report excluded, when QA returns (runbook *Verifier tree check*).
Codex enforces the report leaf through file ownership. The main loop arranges a real report
commit through the existing handoff procedure.

The browser allowlist supports navigation, snapshots, forms, waiting, screenshots,
console messages and network requests. It excludes executable code, uploads, profiles and
arbitrary file outputs. Codex requires navigation, snapshot, console and network observations
before verify/ok. This prerequisite does not prove all requirements correct; scenario
coverage/evidence remain reviewable agent claims and final acceptance is independent.

`report_submit` requires a current bound AgentRun, canonical QA report path and matching
implementation target. Only `qa-verifier` can submit the structured `qa` payload:

```json
{
  "verdict": "pass",
  "targetCommit": "0123456789abcdef0123456789abcdef01234567",
  "baseUrl": "http://127.0.0.1:3000",
  "scenarios": [
    {"id":"save-reload","status":"pass","expected":"Value persists","actual":"Value remained after reload","evidence":["snapshot and network observations in report"]}
  ]
}
```

Verdicts are pass/fail/blocked. Pass needs nonempty scenarios and all passing; fail/blocked
need an explicit failing/blocked scenario. A missing URL may be null only for blocked.
Reports must omit credentials/personal data. The QA node completes only on current-entry
verify/ok, normal report/ok closure, a bound pass report and the current implementation
commit. Failed closure, unbound audit reports and old passes cannot complete QA. They
return wait-on-QA instead of repeatedly dispatching. A failure report's terminal ok only
means evidence recording finished. It never changes the QA verdict.

## Rollout and verification

Update the watcher/plugin first so it recognizes wait-on-QA without stopping other items.
Apply additive migration `20261005000000_qa_verifier` before the new server. Publish/seed
the matching private role/runbooks and refresh consuming installations. Source changes
do not deploy or seed operating databases. Never force-add private template bodies to
this public repository. On rollback leave nullable Report.qa; QA graphs require a compatible
bundle/server or an owner-selected new graph. Existing runs stay on their original version.

Run core/bridge, frontend, template and isolated database tests. Actual browser transport
rehearsal: `node tests/browser/qa-browser.rehearsal.mjs <mcp-cli-path>`. It uses temporary
local fixtures and isolated Edge, proving transport/actions/evidence rather than a live
model role run or complete product user-flow coverage.

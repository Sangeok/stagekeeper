---
name: harness-init
description: Connect this repository to Stagekeeper from Codex, preserving its Claude Code configuration.
---

Resolve this installed SKILL.md's actual absolute path. Its package root is three parents
above the skill directory. Verify `.codex-plugin/plugin.json` declares harness, version
0.5.1 or later and skills `./codex/skills/`, and verify the bin/runtime/lib files below exist.
Never assume CODEX_PLUGIN_ROOT or use an unrelated checkout as the installed package.

Use the owner's chosen native client and existing login. Do not require WSL, a VM/container,
another client login, or manual Node/verifier-skill installation to connect Stagekeeper.
On Windows, use the packaged `bin/harness.ps1 <task> <existing arguments>` through
`powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File <absolute helper>`.
Use task `init` for harness-init.mjs, `codex` for harness-codex.mjs and `session` for
harness-session.mjs. Translate all helper invocations below through this launcher on Windows.
This uses the verified bundled Node runtime; the policy applies only to that helper process.
The complete original verifier is bundled at `codex/skills/reconciling-proposals-with-codebase`.
If the installed package lacks either dependency, report a Stagekeeper packaging failure
and stop. Do not turn a source-only checkout into extra user setup steps or claim readiness.

Read `references/reconciliation-contract.md`. Resolve and read the complete bundled original
reconciling-proposals-with-codebase package and its referenced resources. Check the actual
staged Codex role loader path and checksum; incompatible or missing packages block
init. Never download or manufacture a replacement. Perform this before any generated write.

Use HARNESS_TOKEN from this shell; never print it or put it in a command, document or config.
HARNESS_SERVER must be an HTTP(S) base URL without credentials, query or fragment.
For a new harness.json use the shared generator's `--client codex --print-project` for hs_,
or `--client codex --register` for hu_. Confirm returned identity against the intended repo.
Preserve an existing harness.json, roster and verified project.slug. A hu_ token needs the
actual registered slug. Draft missing workspaces from the repo and accept user corrections;
agent names are durable identity. Do not infer a slug from a key or silently replace identity.

Run the installed `bin/harness-init.mjs --client codex --dry-run` from the repo, through
the packaged launcher on Windows or Node on other supported hosts.
Handle refused unowned files with the user's explicit adopt instruction, preserve modified
files, and use the host's normal approval flow for protected paths. Dry-run writes nothing.
Then run it without dry-run. Preserve `.claude/`, CLAUDE.md and .mcp.json; the generator owns
only its Codex files and common docs. `files-written` alone is not ready.

Run installed `bin/harness-codex.mjs complete-init`. It registers only the harness MCP entry
with bearer token env var HARNESS_TOKEN, syncs the configured roster/language, and verifies
actual project and Codex bundle/runtime/version. It preserves all unrelated and owner MCP
entries. A failed registration/sync is partial initialization; report the last successful
phase and repair it without automatic adopt. Do not copy any auth store or API key.

Read generated docs/harness/codex-runbook.md. Wiring success says `connected` with
runtimeVerificationRequired; call it ready only after this host/version's required effective
role permissions, fresh context, actual verifier loading and quiescent cancellation tests
pass. A model/sandbox denial or the C0 failure remains blocked. Do not announce automatic
Codex watch; this package provides explicit foreground run/resume.

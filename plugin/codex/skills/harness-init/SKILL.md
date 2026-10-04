---
name: harness-init
description: Connect this repository to Stagekeeper from Codex, preserving its Claude Code configuration.
---

Resolve this installed SKILL.md's actual absolute path. Its package root is three parents
above the skill directory. Verify `.codex-plugin/plugin.json` declares harness, version
0.5.0 or later and skills `./codex/skills/`, and verify the bin/runtime/lib files below exist.
Never assume CODEX_PLUGIN_ROOT or use an unrelated checkout as the installed package.

Use the owner's chosen native client and existing login. Do not require WSL, a VM/container,
another client login, or manual Node/verifier-skill installation to connect Stagekeeper.
This source version still depends on Node and an owner-provided verifier package. If those
dependencies are unavailable, report an unresolved Stagekeeper packaging requirement and
stop; do not turn them into extra user setup steps or claim the package is ready.

Read `references/reconciliation-contract.md`. Resolve and read the complete owner-provided
reconciling-proposals-with-codebase package and its referenced resources. Check the actual
winning Codex loader path and checksum; incompatible, duplicate or missing packages block
init. Never download or manufacture a replacement. Perform this before any generated write.

Use HARNESS_TOKEN from this shell; never print it or put it in a command, document or config.
HARNESS_SERVER must be an HTTP(S) base URL without credentials, query or fragment.
For a new harness.json use the shared generator's `--client codex --print-project` for hs_,
or `--client codex --register` for hu_. Confirm returned identity against the intended repo.
Preserve an existing harness.json, roster and verified project.slug. A hu_ token needs the
actual registered slug. Draft missing workspaces from the repo and accept user corrections;
agent names are durable identity. Do not infer a slug from a key or silently replace identity.

Run the installed `bin/harness-init.mjs --client codex --dry-run` through Node from the repo.
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

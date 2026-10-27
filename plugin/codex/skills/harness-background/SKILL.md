---
name: harness-background
description: Explicitly start, inspect, stop or release the Stagekeeper Codex background runner on a validated Windows candidate installation.
---

Resolve the installed package from this SKILL.md (three parents above this skill directory).
Read its .codex-plugin/plugin.json and this checkout's harness.json and
docs/harness/codex-runbook.md. Use the bundled bin/harness.ps1 background helper through
powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File <absolute helper>.
The helper validates its included runtime. Never install Node, use WSL, copy credentials,
broaden permissions or fall back to Claude Code when this entry fails.

This candidate supports an explicit Windows start. Clean Windows, macOS and mixed-host
release acceptance remain separate; do not promise support from a successful local start.
Never start it automatically from init, a client switch, sign-in or a foreground run.

Use --status --root <absolute checkout> to inspect ownership. For an explicit start, ensure
the existing foreground/watch/resident and all its children have settled. A lock is a refusal;
never delete it or adopt its session ID outside the confirmed release below. Preserve uncommitted
files and existing staging.
Starting grants commit permission for current pipeline artifacts, never push or gate approval.
Use the user's current proposal preference; ask only if that preference is absent.
Then run --start --client codex --root <absolute checkout> --propose yes|no.
Use --takeover only after explicit authorization to replace the server's current runner.
The server must confirm this exact Codex resident session with scoped permission; a missing
route or incomplete echo stops startup without a foreground fallback.

For stop, run --stop --root <absolute checkout> without a client or session override.
Stop uses stored ownership, interrupts the current turn and waits for its requests and
children to settle before releasing the lock. A stopping/unsettled result needs investigation;
do not force-remove state or report successful cleanup. Use --status to check again.

A held refusal or held status means no runner process is left but the checkout is still held.
Run --release --root <absolute checkout>, repeat the lines it printed and ask once:
"No runner process is left, but this checkout is still held. Release it so a runner can start
here again?" Only an explicit yes runs --release --session <session from that check> --root
<absolute checkout>. Never pass any other session ID and never remove state files yourself.
A newer status or refusal means a newer Stagekeeper plugin holds the checkout: stop still works,
but say "A newer Stagekeeper plugin holds this checkout. You can stop it from here, but update
this plugin before you start or release here." and do not start or release.

The Board's Pause stops new work while the current role settles. Wait for the runner's
paused state before editing. Resume rereads current server work. Branch, dirty-tree,
plan/cap, gate, QA and acceptance waits retain the existing pipeline rules. New cycles use
fresh main-loop and role contexts, preserve server receipts and run all five acceptance checks.
Codex sign-in autostart is unavailable. Stop, status and release infer the stored client; never
pass --client to those operations or any autostart operation.

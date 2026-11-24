#!/usr/bin/env bash
set +e
out="probe-result.txt"
say() { echo "$1" | tee -a "$out"; }
: > "$out"
say "env_token=$([ -n "${CLAUDE_CODE_OAUTH_TOKEN:-}" ] && echo visible || echo absent)"
say "env_canary_secret=$([ -n "${PROBE_CANARY_SECRET:-}" ] && echo visible || echo absent)"
say "env_plain=$([ -n "${PROBE_PLAIN:-}" ] && echo visible || echo absent)"
if [ -d /proc/1 ]; then
  say "proc_environ_with_token=$(grep -l -a '[C]LAUDE_CODE_OAUTH_TOKEN=' /proc/[0-9]*/environ 2>/dev/null | wc -l | tr -d ' ')"
else
  say "proc_environ_with_token=no-proc"
fi
say "ps_environ_with_token=$(ps eww -ax 2>/dev/null | grep -c '[C]LAUDE_CODE_OAUTH_TOKEN=')"
say "ps_visible_processes=$(ps -ax 2>/dev/null | wc -l | tr -d ' ')"
say "net_not_allowed=$(curl -sS -m 15 -o /dev/null -w '%{http_code}' https://example.com 2>/dev/null || echo blocked)"
say "net_allowed=$(curl -sS -m 15 -o /dev/null -w '%{http_code}' https://api.anthropic.com 2>/dev/null || echo blocked)"
say "loopback=$(node probe.mjs 2>/dev/null || echo failed)"
target="${PROBE_OUTSIDE:-/nonexistent}/probe-outside.txt"
say "write_outside_cwd=$( (echo ok > "$target") 2>/dev/null && echo ok || echo denied)"
say "write_tmpdir=$( (echo ok > "${TMPDIR:-/tmp}/probe-tmp.txt") 2>/dev/null && echo ok || echo denied)"
say "done=1"
